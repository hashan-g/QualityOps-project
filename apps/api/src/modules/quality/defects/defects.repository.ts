import type { PoolClient, QueryResult } from 'pg';
import { pool } from '../../../infrastructure/database/pool.js';
import type {
  DefectAnalyticsFilter,
  DefectAnalyticsOverview,
  DefectAnalyticsResponse,
  DefectByEntityItem,
  DefectBySeverityItem,
  DefectByTypeItem,
  DefectParetoItem,
  DefectRecord,
  DefectRecordListQuery,
  DefectRecordListResponse,
  DefectSeverity,
  DefectTrendItem,
} from '@qualityops/contracts';

export interface DefectRecordDbRow {
  id: string;
  inspection_id: string;
  defect_type_id: string;
  occurrence_count: number;
  affected_unit_count: number;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  defect_type_code?: string;
  defect_type_name?: string;
  defect_type_category?: string;
  defect_type_severity?: DefectSeverity;
  inspection_number?: string;
  inspection_stage?: string;
  batch_id?: string;
  batch_number?: string;
  product_id?: string;
  product_code?: string;
  product_name?: string;
  production_line_id?: string;
  production_line_code?: string;
  production_line_name?: string;
  machine_id?: string | null;
  machine_code?: string | null;
  machine_name?: string | null;
  shift_id?: string;
  shift_code?: string;
  shift_name?: string;
}

export function mapDbRowToDefectRecord(row: DefectRecordDbRow): DefectRecord {
  return {
    id: row.id,
    inspectionId: row.inspection_id,
    defectTypeId: row.defect_type_id,
    occurrenceCount: row.occurrence_count,
    affectedUnitCount: row.affected_unit_count,
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    defectTypeCode: row.defect_type_code,
    defectTypeName: row.defect_type_name,
    defectTypeCategory: row.defect_type_category,
    defectTypeSeverity: row.defect_type_severity,
    inspectionNumber: row.inspection_number,
    inspectionStage: row.inspection_stage,
    batchId: row.batch_id,
    batchNumber: row.batch_number,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    productionLineId: row.production_line_id,
    productionLineCode: row.production_line_code,
    productionLineName: row.production_line_name,
    machineId: row.machine_id ?? null,
    machineCode: row.machine_code ?? null,
    machineName: row.machine_name ?? null,
    shiftId: row.shift_id,
    shiftCode: row.shift_code,
    shiftName: row.shift_name,
  };
}

export interface CreateDefectRecordDbParams {
  inspectionId: string;
  defectTypeId: string;
  occurrenceCount: number;
  affectedUnitCount: number;
  notes?: string | null | undefined;
}

export interface UpdateDefectRecordDbParams {
  occurrenceCount?: number | undefined;
  affectedUnitCount?: number | undefined;
  notes?: string | null | undefined;
}

export class DefectsRepository {
  public async list(query: DefectRecordListQuery): Promise<DefectRecordListResponse> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (query.inspectionId) {
      conditions.push(`dr.inspection_id = $${paramIndex++}`);
      values.push(query.inspectionId);
    }

    if (query.batchId) {
      conditions.push(`qi.batch_id = $${paramIndex++}`);
      values.push(query.batchId);
    }

    if (query.defectTypeId) {
      conditions.push(`dr.defect_type_id = $${paramIndex++}`);
      values.push(query.defectTypeId);
    }

    if (query.severity) {
      conditions.push(`dt.severity = $${paramIndex++}`);
      values.push(query.severity);
    }

    if (query.productId) {
      conditions.push(`pb.product_id = $${paramIndex++}`);
      values.push(query.productId);
    }

    if (query.productionLineId) {
      conditions.push(`pb.production_line_id = $${paramIndex++}`);
      values.push(query.productionLineId);
    }

    if (query.machineId) {
      conditions.push(`pb.machine_id = $${paramIndex++}`);
      values.push(query.machineId);
    }

    if (query.shiftId) {
      conditions.push(`pb.shift_id = $${paramIndex++}`);
      values.push(query.shiftId);
    }

    if (query.startDate) {
      conditions.push(`qi.inspected_at >= $${paramIndex++}`);
      values.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push(`qi.inspected_at <= $${paramIndex++}`);
      values.push(query.endDate);
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        `(dt.code ILIKE $${paramIndex} OR dt.name ILIKE $${paramIndex} OR qi.inspection_number ILIKE $${paramIndex} OR pb.batch_number ILIKE $${paramIndex} OR p.code ILIKE $${paramIndex})`,
      );
      values.push(term);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM defect_records dr
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      ${whereClause};
    `;
    const countResult = await pool.query<{ total: number }>(countQuery, values);
    const total = countResult.rows[0]?.total ?? 0;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const selectQuery = `
      SELECT
        dr.*,
        dt.code AS defect_type_code,
        dt.name AS defect_type_name,
        dt.category AS defect_type_category,
        dt.severity AS defect_type_severity,
        qi.inspection_number,
        qi.stage AS inspection_stage,
        pb.id AS batch_id,
        pb.batch_number,
        p.id AS product_id,
        p.code AS product_code,
        p.name AS product_name,
        pl.id AS production_line_id,
        pl.code AS production_line_code,
        pl.name AS production_line_name,
        m.id AS machine_id,
        m.code AS machine_code,
        m.name AS machine_name,
        s.id AS shift_id,
        s.code AS shift_code,
        s.name AS shift_name
      FROM defect_records dr
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      JOIN production_lines pl ON pb.production_line_id = pl.id
      JOIN shifts s ON pb.shift_id = s.id
      LEFT JOIN machines m ON pb.machine_id = m.id
      ${whereClause}
      ORDER BY dr.created_at DESC, dr.id ASC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;
    const queryValues = [...values, limit, offset];
    const result = await pool.query<DefectRecordDbRow>(selectQuery, queryValues);

    const items = result.rows.map(mapDbRowToDefectRecord);
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  public async findById(id: string, client?: PoolClient): Promise<DefectRecord | null> {
    const query = `
      SELECT
        dr.*,
        dt.code AS defect_type_code,
        dt.name AS defect_type_name,
        dt.category AS defect_type_category,
        dt.severity AS defect_type_severity,
        qi.inspection_number,
        qi.stage AS inspection_stage,
        pb.id AS batch_id,
        pb.batch_number,
        p.id AS product_id,
        p.code AS product_code,
        p.name AS product_name,
        pl.id AS production_line_id,
        pl.code AS production_line_code,
        pl.name AS production_line_name,
        m.id AS machine_id,
        m.code AS machine_code,
        m.name AS machine_name,
        s.id AS shift_id,
        s.code AS shift_code,
        s.name AS shift_name
      FROM defect_records dr
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      JOIN production_lines pl ON pb.production_line_id = pl.id
      JOIN shifts s ON pb.shift_id = s.id
      LEFT JOIN machines m ON pb.machine_id = m.id
      WHERE dr.id = $1;
    `;
    const res = client
      ? await client.query<DefectRecordDbRow>(query, [id])
      : await pool.query<DefectRecordDbRow>(query, [id]);
    const row = res.rows[0];
    return row ? mapDbRowToDefectRecord(row) : null;
  }

  public async findByInspectionAndDefectType(
    inspectionId: string,
    defectTypeId: string,
    client?: PoolClient,
  ): Promise<DefectRecord | null> {
    const query = `
      SELECT
        dr.*,
        dt.code AS defect_type_code,
        dt.name AS defect_type_name,
        dt.category AS defect_type_category,
        dt.severity AS defect_type_severity,
        qi.inspection_number,
        qi.stage AS inspection_stage,
        pb.id AS batch_id,
        pb.batch_number,
        p.id AS product_id,
        p.code AS product_code,
        p.name AS product_name,
        pl.id AS production_line_id,
        pl.code AS production_line_code,
        pl.name AS production_line_name,
        m.id AS machine_id,
        m.code AS machine_code,
        m.name AS machine_name,
        s.id AS shift_id,
        s.code AS shift_code,
        s.name AS shift_name
      FROM defect_records dr
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      JOIN production_lines pl ON pb.production_line_id = pl.id
      JOIN shifts s ON pb.shift_id = s.id
      LEFT JOIN machines m ON pb.machine_id = m.id
      WHERE dr.inspection_id = $1 AND dr.defect_type_id = $2;
    `;
    const res = client
      ? await client.query<DefectRecordDbRow>(query, [inspectionId, defectTypeId])
      : await pool.query<DefectRecordDbRow>(query, [inspectionId, defectTypeId]);
    const row = res.rows[0];
    return row ? mapDbRowToDefectRecord(row) : null;
  }

  public async create(
    params: CreateDefectRecordDbParams,
    client: PoolClient,
  ): Promise<DefectRecord> {
    const query = `
      INSERT INTO defect_records (
        inspection_id, defect_type_id, occurrence_count, affected_unit_count, notes
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [
      params.inspectionId,
      params.defectTypeId,
      params.occurrenceCount,
      params.affectedUnitCount,
      params.notes ?? null,
    ];
    const res: QueryResult<DefectRecordDbRow> = await client.query(query, values);
    const createdId = res.rows[0]!.id;

    const fullRecord = await this.findById(createdId, client);
    if (!fullRecord) {
      throw new Error(`Failed to retrieve newly created defect record ${createdId}`);
    }
    return fullRecord;
  }

  public async update(
    id: string,
    params: UpdateDefectRecordDbParams,
    client: PoolClient,
  ): Promise<DefectRecord> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.occurrenceCount !== undefined) {
      updates.push(`occurrence_count = $${paramIndex++}`);
      values.push(params.occurrenceCount);
    }

    if (params.affectedUnitCount !== undefined) {
      updates.push(`affected_unit_count = $${paramIndex++}`);
      values.push(params.affectedUnitCount);
    }

    if (params.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(params.notes);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id);
    const query = `
      UPDATE defect_records
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *;
    `;

    await client.query(query, values);

    const fullRecord = await this.findById(id, client);
    if (!fullRecord) {
      throw new Error(`Failed to retrieve updated defect record ${id}`);
    }
    return fullRecord;
  }

  public async getAnalytics(filter: DefectAnalyticsFilter): Promise<DefectAnalyticsResponse> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.startDate) {
      conditions.push(`qi.inspected_at >= $${paramIndex++}`);
      values.push(filter.startDate);
    }

    if (filter.endDate) {
      conditions.push(`qi.inspected_at <= $${paramIndex++}`);
      values.push(filter.endDate);
    }

    if (filter.batchId) {
      conditions.push(`qi.batch_id = $${paramIndex++}`);
      values.push(filter.batchId);
    }

    if (filter.productId) {
      conditions.push(`pb.product_id = $${paramIndex++}`);
      values.push(filter.productId);
    }

    if (filter.productionLineId) {
      conditions.push(`pb.production_line_id = $${paramIndex++}`);
      values.push(filter.productionLineId);
    }

    if (filter.machineId) {
      conditions.push(`pb.machine_id = $${paramIndex++}`);
      values.push(filter.machineId);
    }

    if (filter.shiftId) {
      conditions.push(`pb.shift_id = $${paramIndex++}`);
      values.push(filter.shiftId);
    }

    if (filter.defectTypeId) {
      conditions.push(`dr.defect_type_id = $${paramIndex++}`);
      values.push(filter.defectTypeId);
    }

    if (filter.severity) {
      conditions.push(`dt.severity = $${paramIndex++}`);
      values.push(filter.severity);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Overview
    const overviewQuery = `
      SELECT
        COUNT(dr.id)::int AS total_findings,
        COALESCE(SUM(dr.occurrence_count), 0)::int AS total_occurrences,
        COALESCE(SUM(dr.affected_unit_count), 0)::int AS total_affected_units_across_findings
      FROM defect_records dr
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      ${whereClause};
    `;
    const overviewRes = await pool.query<{
      total_findings: number;
      total_occurrences: number;
      total_affected_units_across_findings: number;
    }>(overviewQuery, values);
    const overview: DefectAnalyticsOverview = {
      totalFindings: overviewRes.rows[0]?.total_findings ?? 0,
      totalOccurrences: overviewRes.rows[0]?.total_occurrences ?? 0,
      totalAffectedUnitsAcrossFindings:
        overviewRes.rows[0]?.total_affected_units_across_findings ?? 0,
    };

    // 2. By Defect Type
    const byTypeQuery = `
      SELECT
        dt.id AS defect_type_id,
        dt.code,
        dt.name,
        dt.category,
        dt.severity,
        COUNT(dr.id)::int AS finding_count,
        COALESCE(SUM(dr.occurrence_count), 0)::int AS occurrence_count,
        COALESCE(SUM(dr.affected_unit_count), 0)::int AS affected_unit_count
      FROM defect_records dr
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      ${whereClause}
      GROUP BY dt.id, dt.code, dt.name, dt.category, dt.severity
      ORDER BY affected_unit_count DESC, occurrence_count DESC, dt.code ASC;
    `;
    const byTypeRes = await pool.query<{
      defect_type_id: string;
      code: string;
      name: string;
      category: string;
      severity: DefectSeverity;
      finding_count: number;
      occurrence_count: number;
      affected_unit_count: number;
    }>(byTypeQuery, values);
    const byType: DefectByTypeItem[] = byTypeRes.rows.map((r) => ({
      defectTypeId: r.defect_type_id,
      code: r.code,
      name: r.name,
      category: r.category,
      severity: r.severity,
      findingCount: r.finding_count,
      occurrenceCount: r.occurrence_count,
      affectedUnitCount: r.affected_unit_count,
    }));

    // 3. By Severity
    const bySeverityQuery = `
      SELECT
        dt.severity,
        COUNT(dr.id)::int AS finding_count,
        COALESCE(SUM(dr.occurrence_count), 0)::int AS occurrence_count,
        COALESCE(SUM(dr.affected_unit_count), 0)::int AS affected_unit_count
      FROM defect_records dr
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      ${whereClause}
      GROUP BY dt.severity
      ORDER BY CASE dt.severity WHEN 'CRITICAL' THEN 1 WHEN 'MAJOR' THEN 2 WHEN 'MINOR' THEN 3 ELSE 4 END;
    `;
    const bySeverityRes = await pool.query<{
      severity: DefectSeverity;
      finding_count: number;
      occurrence_count: number;
      affected_unit_count: number;
    }>(bySeverityQuery, values);
    const bySeverity: DefectBySeverityItem[] = bySeverityRes.rows.map((r) => ({
      severity: r.severity,
      findingCount: r.finding_count,
      occurrenceCount: r.occurrence_count,
      affectedUnitCount: r.affected_unit_count,
    }));

    // 4. By Product
    const byProductQuery = `
      SELECT
        p.id,
        p.code,
        p.name,
        COUNT(dr.id)::int AS finding_count,
        COALESCE(SUM(dr.occurrence_count), 0)::int AS occurrence_count,
        COALESCE(SUM(dr.affected_unit_count), 0)::int AS affected_unit_count
      FROM defect_records dr
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      ${whereClause}
      GROUP BY p.id, p.code, p.name
      ORDER BY affected_unit_count DESC, p.code ASC;
    `;
    const byProductRes = await pool.query<{
      id: string;
      code: string;
      name: string;
      finding_count: number;
      occurrence_count: number;
      affected_unit_count: number;
    }>(byProductQuery, values);
    const byProduct: DefectByEntityItem[] = byProductRes.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      findingCount: r.finding_count,
      occurrenceCount: r.occurrence_count,
      affectedUnitCount: r.affected_unit_count,
    }));

    // 5. By Production Line
    const byLineQuery = `
      SELECT
        pl.id,
        pl.code,
        pl.name,
        COUNT(dr.id)::int AS finding_count,
        COALESCE(SUM(dr.occurrence_count), 0)::int AS occurrence_count,
        COALESCE(SUM(dr.affected_unit_count), 0)::int AS affected_unit_count
      FROM defect_records dr
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN production_lines pl ON pb.production_line_id = pl.id
      ${whereClause}
      GROUP BY pl.id, pl.code, pl.name
      ORDER BY affected_unit_count DESC, pl.code ASC;
    `;
    const byLineRes = await pool.query<{
      id: string;
      code: string;
      name: string;
      finding_count: number;
      occurrence_count: number;
      affected_unit_count: number;
    }>(byLineQuery, values);
    const byProductionLine: DefectByEntityItem[] = byLineRes.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      findingCount: r.finding_count,
      occurrenceCount: r.occurrence_count,
      affectedUnitCount: r.affected_unit_count,
    }));

    // 6. By Machine
    const byMachineQuery = `
      SELECT
        m.id,
        m.code,
        m.name,
        COUNT(dr.id)::int AS finding_count,
        COALESCE(SUM(dr.occurrence_count), 0)::int AS occurrence_count,
        COALESCE(SUM(dr.affected_unit_count), 0)::int AS affected_unit_count
      FROM defect_records dr
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN machines m ON pb.machine_id = m.id
      ${whereClause}
      GROUP BY m.id, m.code, m.name
      ORDER BY affected_unit_count DESC, m.code ASC;
    `;
    const byMachineRes = await pool.query<{
      id: string;
      code: string;
      name: string;
      finding_count: number;
      occurrence_count: number;
      affected_unit_count: number;
    }>(byMachineQuery, values);
    const byMachine: DefectByEntityItem[] = byMachineRes.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      findingCount: r.finding_count,
      occurrenceCount: r.occurrence_count,
      affectedUnitCount: r.affected_unit_count,
    }));

    // 7. By Shift
    const byShiftQuery = `
      SELECT
        s.id,
        s.code,
        s.name,
        COUNT(dr.id)::int AS finding_count,
        COALESCE(SUM(dr.occurrence_count), 0)::int AS occurrence_count,
        COALESCE(SUM(dr.affected_unit_count), 0)::int AS affected_unit_count
      FROM defect_records dr
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN shifts s ON pb.shift_id = s.id
      ${whereClause}
      GROUP BY s.id, s.code, s.name
      ORDER BY affected_unit_count DESC, s.code ASC;
    `;
    const byShiftRes = await pool.query<{
      id: string;
      code: string;
      name: string;
      finding_count: number;
      occurrence_count: number;
      affected_unit_count: number;
    }>(byShiftQuery, values);
    const byShift: DefectByEntityItem[] = byShiftRes.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      findingCount: r.finding_count,
      occurrenceCount: r.occurrence_count,
      affectedUnitCount: r.affected_unit_count,
    }));

    // 8. Trend by Day/Week/Month
    const interval =
      filter.trendInterval === 'MONTH' ? 'month' : filter.trendInterval === 'WEEK' ? 'week' : 'day';
    const trendQuery = `
      SELECT
        TO_CHAR(DATE_TRUNC('${interval}', qi.inspected_at), 'YYYY-MM-DD') AS period,
        COUNT(dr.id)::int AS finding_count,
        COALESCE(SUM(dr.occurrence_count), 0)::int AS occurrence_count,
        COALESCE(SUM(dr.affected_unit_count), 0)::int AS affected_unit_count
      FROM defect_records dr
      JOIN quality_inspections qi ON dr.inspection_id = qi.id
      JOIN defect_types dt ON dr.defect_type_id = dt.id
      JOIN production_batches pb ON qi.batch_id = pb.id
      ${whereClause}
      GROUP BY DATE_TRUNC('${interval}', qi.inspected_at)
      ORDER BY DATE_TRUNC('${interval}', qi.inspected_at) ASC;
    `;
    const trendRes = await pool.query<{
      period: string;
      finding_count: number;
      occurrence_count: number;
      affected_unit_count: number;
    }>(trendQuery, values);
    const trend: DefectTrendItem[] = trendRes.rows.map((r) => ({
      period: r.period,
      findingCount: r.finding_count,
      occurrenceCount: r.occurrence_count,
      affectedUnitCount: r.affected_unit_count,
    }));

    // 9. Pareto ranking (by affectedUnitCount across findings)
    const paretoTotal = overview.totalAffectedUnitsAcrossFindings;
    let runningSum = 0;
    const pareto: DefectParetoItem[] = byType.map((item) => {
      runningSum += item.affectedUnitCount;
      const pct = paretoTotal > 0 ? (item.affectedUnitCount / paretoTotal) * 100 : 0;
      const cumPct = paretoTotal > 0 ? (runningSum / paretoTotal) * 100 : 0;
      return {
        defectTypeId: item.defectTypeId,
        code: item.code,
        name: item.name,
        category: item.category,
        severity: item.severity,
        measure: 'affectedUnitCount',
        value: item.affectedUnitCount,
        percentage: Number(pct.toFixed(2)),
        cumulativePercentage: Number(Math.min(100, cumPct).toFixed(2)),
      };
    });

    return {
      overview,
      byType,
      bySeverity,
      byProduct,
      byProductionLine,
      byMachine,
      byShift,
      trend,
      pareto,
    };
  }
}

export const defectsRepository = new DefectsRepository();
