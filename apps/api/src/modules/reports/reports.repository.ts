import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../../infrastructure/database/pool.js';
import type {
  ProductionPerformanceFilter,
  ProductionPerformanceReport,
  InspectionSummaryFilter,
  InspectionSummaryReport,
  DefectAnalysisFilter,
  DefectAnalysisReport,
  CapaStatusFilter,
  CapaStatusReport,
} from '@qualityops/contracts';

export class ReportsRepository {
  private async query<R extends QueryResultRow = QueryResultRow>(
    client: PoolClient | undefined,
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>> {
    if (client) {
      return client.query<R>(text, params);
    }
    return pool.query<R>(text, params);
  }

  /**
   * 1. Production Performance Report
   */
  public async getProductionPerformanceReport(
    filters: ProductionPerformanceFilter,
    client?: PoolClient,
  ): Promise<ProductionPerformanceReport> {
    const conditions: string[] = ['pb.created_at >= $1', 'pb.created_at <= $2'];
    const params: unknown[] = [filters.from, filters.to];
    let pIdx = 3;

    if (filters.productId) {
      conditions.push(`pb.product_id = $${pIdx++}`);
      params.push(filters.productId);
    }
    if (filters.productionLineId) {
      conditions.push(`pb.production_line_id = $${pIdx++}`);
      params.push(filters.productionLineId);
    }
    if (filters.status) {
      conditions.push(`pb.status = $${pIdx++}`);
      params.push(filters.status);
    }

    const whereClause = conditions.join(' AND ');

    // Query 1: Batches & Aggregates
    const batchSummarySql = `
      SELECT
        COUNT(*)::int AS total_batches,
        COALESCE(SUM(pb.planned_quantity), 0)::int AS total_planned,
        COALESCE(SUM(pb.produced_quantity), 0)::int AS total_produced,
        COALESCE(SUM(pb.accepted_quantity), 0)::int AS total_accepted,
        COALESCE(SUM(pb.scrap_quantity), 0)::int AS total_scrap,
        COALESCE(SUM(pb.rework_pending_quantity), 0)::int AS total_rework_pending,
        COUNT(*) FILTER (WHERE pb.status = 'PLANNED')::int AS count_planned,
        COUNT(*) FILTER (WHERE pb.status = 'IN_PROGRESS')::int AS count_in_progress,
        COUNT(*) FILTER (WHERE pb.status = 'COMPLETED')::int AS count_completed,
        COUNT(*) FILTER (WHERE pb.status = 'CANCELLED')::int AS count_cancelled,
        COUNT(*) FILTER (WHERE pb.status = 'ON_HOLD')::int AS count_on_hold
      FROM production_batches pb
      WHERE ${whereClause};
    `;
    const summaryRes = await this.query(client, batchSummarySql, params);
    const summaryRow = summaryRes.rows[0];

    // Query 2: Downtime in same period
    const downtimeSql = `
      SELECT
        COUNT(*)::int AS total_events,
        COALESCE(SUM(duration_seconds), 0)::int AS total_duration_seconds
      FROM downtime_records dr
      WHERE dr.started_at >= $1 AND dr.started_at <= $2;
    `;
    const downtimeRes = await this.query(client, downtimeSql, [filters.from, filters.to]);
    const downtimeRow = downtimeRes.rows[0];

    // Query 3: Rows
    const rowsSql = `
      SELECT
        pb.id AS "batchId",
        pb.batch_number AS "batchNumber",
        p.code AS "productCode",
        p.name AS "productName",
        pl.code AS "productionLineCode",
        pl.name AS "productionLineName",
        pb.status,
        pb.planned_quantity AS "plannedQuantity",
        pb.produced_quantity AS "producedQuantity",
        pb.accepted_quantity AS "acceptedQuantity",
        pb.scrap_quantity AS "scrapQuantity",
        pb.rework_pending_quantity AS "reworkPendingQuantity",
        pb.started_at AS "startedAt",
        pb.completed_at AS "completedAt"
      FROM production_batches pb
      JOIN products p ON pb.product_id = p.id
      JOIN production_lines pl ON pb.production_line_id = pl.id
      WHERE ${whereClause}
      ORDER BY pb.created_at DESC
      LIMIT 1000;
    `;
    const rowsRes = await this.query(client, rowsSql, params);

    const totalProduced = summaryRow?.total_produced ?? 0;
    const totalScrap = summaryRow?.total_scrap ?? 0;
    const overallScrapRate =
      totalProduced > 0 ? Number((totalScrap / totalProduced).toFixed(4)) : 0.0;

    return {
      reportType: 'production-performance',
      generatedAt: new Date().toISOString(),
      filters: filters as Record<string, unknown>,
      summary: {
        totalBatches: summaryRow?.total_batches ?? 0,
        batchesByStatus: {
          PLANNED: summaryRow?.count_planned ?? 0,
          IN_PROGRESS: summaryRow?.count_in_progress ?? 0,
          COMPLETED: summaryRow?.count_completed ?? 0,
          CANCELLED: summaryRow?.count_cancelled ?? 0,
          ON_HOLD: summaryRow?.count_on_hold ?? 0,
        },
        totalPlannedQuantity: summaryRow?.total_planned ?? 0,
        totalProducedQuantity: totalProduced,
        totalAcceptedQuantity: summaryRow?.total_accepted ?? 0,
        totalScrapQuantity: totalScrap,
        totalReworkPendingQuantity: summaryRow?.total_rework_pending ?? 0,
        overallScrapRate,
        totalDowntimeEvents: downtimeRow?.total_events ?? 0,
        totalDowntimeDurationSeconds: downtimeRow?.total_duration_seconds ?? 0,
      },
      rows: rowsRes.rows.map((r) => ({
        batchId: r.batchId,
        batchNumber: r.batchNumber,
        productCode: r.productCode,
        productName: r.productName,
        productionLineCode: r.productionLineCode,
        productionLineName: r.productionLineName,
        status: r.status,
        plannedQuantity: r.plannedQuantity,
        producedQuantity: r.producedQuantity,
        acceptedQuantity: r.acceptedQuantity,
        scrapQuantity: r.scrapQuantity,
        reworkPendingQuantity: r.reworkPendingQuantity,
        startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
        completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
      })),
    };
  }

  /**
   * 2. Quality Inspection Summary Report
   */
  public async getInspectionSummaryReport(
    filters: InspectionSummaryFilter,
    client?: PoolClient,
  ): Promise<InspectionSummaryReport> {
    const conditions: string[] = ['qi.inspected_at >= $1', 'qi.inspected_at <= $2'];
    const params: unknown[] = [filters.from, filters.to];
    let pIdx = 3;

    if (filters.productId) {
      conditions.push(`pb.product_id = $${pIdx++}`);
      params.push(filters.productId);
    }
    if (filters.productionLineId) {
      conditions.push(`pb.production_line_id = $${pIdx++}`);
      params.push(filters.productionLineId);
    }
    if (filters.stage) {
      conditions.push(`qi.stage = $${pIdx++}`);
      params.push(filters.stage);
    }
    if (filters.result) {
      conditions.push(`qi.result = $${pIdx++}`);
      params.push(filters.result);
    }

    const whereClause = conditions.join(' AND ');

    // Aggregate summary query
    const summarySql = `
      SELECT
        COUNT(*)::int AS total_inspections,
        COUNT(*) FILTER (WHERE qi.status = 'COMPLETED')::int AS completed_inspections,
        COUNT(*) FILTER (WHERE qi.status = 'IN_PROGRESS')::int AS in_progress_inspections,
        COUNT(*) FILTER (WHERE qi.status = 'CANCELLED')::int AS cancelled_inspections,
        COALESCE(SUM(qi.sample_size) FILTER (WHERE qi.status = 'COMPLETED'), 0)::int AS total_sample_units,
        COALESCE(SUM(qi.passed_units) FILTER (WHERE qi.status = 'COMPLETED'), 0)::int AS total_passed_units,
        COALESCE(SUM(qi.failed_units) FILTER (WHERE qi.status = 'COMPLETED'), 0)::int AS total_failed_units,
        COUNT(*) FILTER (WHERE qi.stage = 'IN_PROCESS')::int AS stage_in_process,
        COUNT(*) FILTER (WHERE qi.stage = 'FINAL')::int AS stage_final,
        COUNT(*) FILTER (WHERE qi.stage = 'RECEIVING')::int AS stage_receiving,
        COUNT(*) FILTER (WHERE qi.result = 'PASS')::int AS result_pass,
        COUNT(*) FILTER (WHERE qi.result = 'FAIL')::int AS result_fail,
        COUNT(*) FILTER (WHERE qi.result = 'CONDITIONAL')::int AS result_conditional
      FROM quality_inspections qi
      JOIN production_batches pb ON qi.batch_id = pb.id
      WHERE ${whereClause};
    `;
    const summaryRes = await this.query(client, summarySql, params);
    const summaryRow = summaryRes.rows[0];

    const totalSample = summaryRow?.total_sample_units ?? 0;
    const totalFailed = summaryRow?.total_failed_units ?? 0;
    const pooledFailureProportion =
      totalSample > 0 ? Number((totalFailed / totalSample).toFixed(4)) : null;

    // Rows query
    const rowsSql = `
      SELECT
        qi.id AS "inspectionId",
        qi.inspection_number AS "inspectionNumber",
        pb.batch_number AS "batchNumber",
        p.code AS "productCode",
        pl.name AS "productionLineName",
        u.full_name AS "inspectorName",
        qi.stage,
        qi.status,
        qi.result,
        qi.sample_size AS "sampleSize",
        qi.passed_units AS "passedUnits",
        qi.failed_units AS "failedUnits",
        CASE
          WHEN qi.sample_size > 0 THEN ROUND((qi.failed_units::numeric / qi.sample_size), 4)
          ELSE NULL
        END AS "failureProportion",
        qi.inspected_at AS "inspectedAt"
      FROM quality_inspections qi
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      JOIN production_lines pl ON pb.production_line_id = pl.id
      JOIN users u ON qi.inspector_id = u.id
      WHERE ${whereClause}
      ORDER BY qi.inspected_at DESC
      LIMIT 1000;
    `;
    const rowsRes = await this.query(client, rowsSql, params);

    return {
      reportType: 'inspection-summary',
      generatedAt: new Date().toISOString(),
      filters: filters as Record<string, unknown>,
      summary: {
        totalInspections: summaryRow?.total_inspections ?? 0,
        completedInspections: summaryRow?.completed_inspections ?? 0,
        inProgressInspections: summaryRow?.in_progress_inspections ?? 0,
        cancelledInspections: summaryRow?.cancelled_inspections ?? 0,
        totalSampleUnits: totalSample,
        totalPassedUnits: summaryRow?.total_passed_units ?? 0,
        totalFailedUnits: totalFailed,
        pooledFailureProportion,
        stageBreakdown: {
          IN_PROCESS: summaryRow?.stage_in_process ?? 0,
          FINAL: summaryRow?.stage_final ?? 0,
          RECEIVING: summaryRow?.stage_receiving ?? 0,
        },
        resultBreakdown: {
          PASS: summaryRow?.result_pass ?? 0,
          FAIL: summaryRow?.result_fail ?? 0,
          CONDITIONAL: summaryRow?.result_conditional ?? 0,
        },
      },
      rows: rowsRes.rows.map((r) => ({
        inspectionId: r.inspectionId,
        inspectionNumber: r.inspectionNumber,
        batchNumber: r.batchNumber,
        productCode: r.productCode,
        productionLineName: r.productionLineName,
        inspectorName: r.inspectorName,
        stage: r.stage,
        status: r.status,
        result: r.result,
        sampleSize: r.sampleSize,
        passedUnits: r.passedUnits,
        failedUnits: r.failedUnits,
        failureProportion: r.failureProportion !== null ? Number(r.failureProportion) : null,
        inspectedAt: new Date(r.inspectedAt).toISOString(),
      })),
    };
  }

  /**
   * 3. Defect Analysis Report
   */
  public async getDefectAnalysisReport(
    filters: DefectAnalysisFilter,
    client?: PoolClient,
  ): Promise<DefectAnalysisReport> {
    const conditions: string[] = ['qi.inspected_at >= $1', 'qi.inspected_at <= $2'];
    const params: unknown[] = [filters.from, filters.to];
    let pIdx = 3;

    if (filters.productId) {
      conditions.push(`pb.product_id = $${pIdx++}`);
      params.push(filters.productId);
    }
    if (filters.productionLineId) {
      conditions.push(`pb.production_line_id = $${pIdx++}`);
      params.push(filters.productionLineId);
    }
    if (filters.defectTypeId) {
      conditions.push(`dr.defect_type_id = $${pIdx++}`);
      params.push(filters.defectTypeId);
    }
    if (filters.severity) {
      conditions.push(`dt.severity = $${pIdx++}`);
      params.push(filters.severity);
    }

    const whereClause = conditions.join(' AND ');

    // Query 1: Totals
    const totalsSql = `
      SELECT
        COUNT(*)::int AS total_findings,
        COALESCE(SUM(dr.occurrence_count), 0)::int AS total_occurrences,
        COALESCE(SUM(dr.affected_unit_count), 0)::int AS total_affected_units,
        COUNT(*) FILTER (WHERE dt.severity = 'CRITICAL')::int AS sev_critical,
        COUNT(*) FILTER (WHERE dt.severity = 'MAJOR')::int AS sev_major,
        COUNT(*) FILTER (WHERE dt.severity = 'MINOR')::int AS sev_minor
      FROM defect_records dr
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      WHERE ${whereClause};
    `;
    const totalsRes = await this.query(client, totalsSql, params);
    const totalsRow = totalsRes.rows[0];

    // Query 2: Pareto ranking of defect types
    const paretoSql = `
      SELECT
        dt.code AS "defectTypeCode",
        dt.name AS "defectTypeName",
        dt.severity,
        SUM(dr.occurrence_count)::int AS occurrences,
        SUM(dr.affected_unit_count)::int AS "affectedUnits"
      FROM defect_records dr
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      WHERE ${whereClause}
      GROUP BY dt.code, dt.name, dt.severity
      ORDER BY occurrences DESC;
    `;
    const paretoRes = await this.query<{
      defectTypeCode: string;
      defectTypeName: string;
      severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
      occurrences: number;
      affectedUnits: number;
    }>(client, paretoSql, params);

    const totalOccurrences = totalsRow?.total_occurrences ?? 0;
    let runningSum = 0;
    const topDefectsPareto = paretoRes.rows.map((row) => {
      runningSum += row.occurrences;
      const cumulativePercentage =
        totalOccurrences > 0 ? Number(((runningSum / totalOccurrences) * 100).toFixed(2)) : 0;
      return {
        defectTypeCode: row.defectTypeCode,
        defectTypeName: row.defectTypeName,
        severity: row.severity,
        occurrences: row.occurrences,
        affectedUnits: row.affectedUnits,
        cumulativePercentage,
      };
    });

    // Query 3: Rows
    const rowsSql = `
      SELECT
        dr.id AS "defectRecordId",
        qi.inspection_number AS "inspectionNumber",
        pb.batch_number AS "batchNumber",
        dt.code AS "defectTypeCode",
        dt.name AS "defectTypeName",
        dt.category,
        dt.severity,
        dr.occurrence_count AS "occurrenceCount",
        dr.affected_unit_count AS "affectedUnitCount",
        dr.notes,
        qi.inspected_at AS "inspectedAt"
      FROM defect_records dr
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      WHERE ${whereClause}
      ORDER BY qi.inspected_at DESC
      LIMIT 1000;
    `;
    const rowsRes = await this.query(client, rowsSql, params);

    return {
      reportType: 'defect-analysis',
      generatedAt: new Date().toISOString(),
      filters: filters as Record<string, unknown>,
      summary: {
        totalFindings: totalsRow?.total_findings ?? 0,
        totalOccurrences,
        totalAffectedUnits: totalsRow?.total_affected_units ?? 0,
        severityBreakdown: {
          CRITICAL: totalsRow?.sev_critical ?? 0,
          MAJOR: totalsRow?.sev_major ?? 0,
          MINOR: totalsRow?.sev_minor ?? 0,
        },
        categoryBreakdown: {},
        topDefectsPareto,
      },
      rows: rowsRes.rows.map((r) => ({
        defectRecordId: r.defectRecordId,
        inspectionNumber: r.inspectionNumber,
        batchNumber: r.batchNumber,
        defectTypeCode: r.defectTypeCode,
        defectTypeName: r.defectTypeName,
        category: r.category,
        severity: r.severity,
        occurrenceCount: r.occurrenceCount,
        affectedUnitCount: r.affectedUnitCount,
        notes: r.notes,
        inspectedAt: new Date(r.inspectedAt).toISOString(),
      })),
    };
  }

  /**
   * 4. CAPA Status Report
   */
  public async getCapaStatusReport(
    filters: CapaStatusFilter,
    client?: PoolClient,
  ): Promise<CapaStatusReport> {
    const conditions: string[] = ['cc.created_at >= $1', 'cc.created_at <= $2'];
    const params: unknown[] = [filters.from, filters.to];
    let pIdx = 3;

    if (filters.status) {
      conditions.push(`cc.status = $${pIdx++}`);
      params.push(filters.status);
    }
    if (filters.priority) {
      conditions.push(`cc.priority = $${pIdx++}`);
      params.push(filters.priority);
    }
    if (filters.source) {
      conditions.push(`cc.source = $${pIdx++}`);
      params.push(filters.source);
    }

    const whereClause = conditions.join(' AND ');

    // Summary query
    const summarySql = `
      SELECT
        COUNT(*)::int AS total_cases,
        COUNT(*) FILTER (WHERE cc.status = 'OPEN')::int AS status_open,
        COUNT(*) FILTER (WHERE cc.status = 'IN_PROGRESS')::int AS status_in_progress,
        COUNT(*) FILTER (WHERE cc.status = 'UNDER_REVIEW')::int AS status_under_review,
        COUNT(*) FILTER (WHERE cc.status = 'CLOSED')::int AS status_closed,
        COUNT(*) FILTER (WHERE cc.status = 'CANCELLED')::int AS status_cancelled,
        COUNT(*) FILTER (WHERE cc.priority = 'LOW')::int AS prio_low,
        COUNT(*) FILTER (WHERE cc.priority = 'MEDIUM')::int AS prio_medium,
        COUNT(*) FILTER (WHERE cc.priority = 'HIGH')::int AS prio_high,
        COUNT(*) FILTER (WHERE cc.priority = 'CRITICAL')::int AS prio_critical,
        COUNT(*) FILTER (WHERE cc.due_date < CURRENT_DATE AND cc.status NOT IN ('CLOSED', 'CANCELLED'))::int AS overdue_cases,
        COUNT(*) FILTER (WHERE cc.verified_by IS NOT NULL)::int AS verified_cases
      FROM capa_cases cc
      WHERE ${whereClause};
    `;
    const summaryRes = await this.query(client, summarySql, params);
    const summaryRow = summaryRes.rows[0];

    // Actions summary
    const actionsSql = `
      SELECT
        COUNT(ca.id)::int AS total_actions,
        COUNT(ca.id) FILTER (WHERE ca.status IN ('COMPLETED', 'VERIFIED'))::int AS completed_actions
      FROM capa_actions ca
      JOIN capa_cases cc ON ca.capa_case_id = cc.id
      WHERE ${whereClause};
    `;
    const actionsRes = await this.query(client, actionsSql, params);
    const actionsRow = actionsRes.rows[0];

    const totalActions = actionsRow?.total_actions ?? 0;
    const completedActions = actionsRow?.completed_actions ?? 0;
    const actionCompletionRate =
      totalActions > 0 ? Number((completedActions / totalActions).toFixed(4)) : 0;

    // Rows query
    const rowsSql = `
      SELECT
        cc.id AS "caseId",
        cc.case_number AS "caseNumber",
        cc.title,
        cc.status,
        cc.priority,
        cc.source,
        cc.due_date AS "dueDate",
        CASE
          WHEN cc.due_date < CURRENT_DATE AND cc.status NOT IN ('CLOSED', 'CANCELLED') THEN true
          ELSE false
        END AS "isOverdue",
        COUNT(ca.id)::int AS "totalActions",
        COUNT(ca.id) FILTER (WHERE ca.status IN ('COMPLETED', 'VERIFIED'))::int AS "completedActions",
        u.full_name AS "verifiedBy",
        cc.verified_at AS "verifiedAt",
        cc.created_at AS "createdAt"
      FROM capa_cases cc
      LEFT JOIN capa_actions ca ON cc.id = ca.capa_case_id
      LEFT JOIN users u ON cc.verified_by = u.id
      WHERE ${whereClause}
      GROUP BY cc.id, cc.case_number, cc.title, cc.status, cc.priority, cc.source, cc.due_date, u.full_name, cc.verified_at, cc.created_at
      ORDER BY cc.created_at DESC
      LIMIT 1000;
    `;
    interface CapaReportDbRow {
      caseId: string;
      caseNumber: string;
      title: string;
      status: 'OPEN' | 'IN_PROGRESS' | 'UNDER_REVIEW' | 'CLOSED' | 'CANCELLED';
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      source:
        | 'INSPECTION_FAILURE'
        | 'INTERNAL_AUDIT'
        | 'CUSTOMER_COMPLAINT'
        | 'RECURRING_DEFECT'
        | 'PROCESS_DEVIATION';
      dueDate: string | null;
      isOverdue: boolean;
      totalActions: number;
      completedActions: number;
      verifiedBy: string | null;
      verifiedAt: Date | string | null;
      createdAt: Date | string;
    }
    const rowsRes = await this.query<CapaReportDbRow>(client, rowsSql, params);

    return {
      reportType: 'capa-status',
      generatedAt: new Date().toISOString(),
      filters: filters as Record<string, unknown>,
      summary: {
        totalCases: summaryRow?.total_cases ?? 0,
        statusBreakdown: {
          OPEN: summaryRow?.status_open ?? 0,
          IN_PROGRESS: summaryRow?.status_in_progress ?? 0,
          UNDER_REVIEW: summaryRow?.status_under_review ?? 0,
          CLOSED: summaryRow?.status_closed ?? 0,
          CANCELLED: summaryRow?.status_cancelled ?? 0,
        },
        priorityBreakdown: {
          LOW: summaryRow?.prio_low ?? 0,
          MEDIUM: summaryRow?.prio_medium ?? 0,
          HIGH: summaryRow?.prio_high ?? 0,
          CRITICAL: summaryRow?.prio_critical ?? 0,
        },
        sourceBreakdown: {},
        overdueCasesCount: summaryRow?.overdue_cases ?? 0,
        totalActions,
        completedActions,
        actionCompletionRate,
        verifiedCasesCount: summaryRow?.verified_cases ?? 0,
      },
      rows: rowsRes.rows.map((r) => ({
        caseId: r.caseId,
        caseNumber: r.caseNumber,
        title: r.title,
        status: r.status,
        priority: r.priority,
        source: r.source,
        dueDate: r.dueDate ? String(r.dueDate) : null,
        isOverdue: Boolean(r.isOverdue),
        totalActions: r.totalActions,
        completedActions: r.completedActions,
        verifiedBy: r.verifiedBy,
        verifiedAt: r.verifiedAt ? new Date(r.verifiedAt).toISOString() : null,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    };
  }
}

export const reportsRepository = new ReportsRepository();
