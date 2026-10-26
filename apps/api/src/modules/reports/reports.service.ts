import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../infrastructure/database/pool.js';
import { reportsRepository, type ReportsRepository } from './reports.repository.js';
import { schedulesRepository, type SchedulesRepository } from './schedules.repository.js';
import { spcService } from '../analytics/spc/spc.service.js';
import { generateCsv } from './exports/csv.exporter.js';
import { generateXlsx, type XlsxColumn } from './exports/xlsx.exporter.js';
import { generatePdf, type PdfColumn } from './exports/pdf.exporter.js';
import { artifactStorage, type ArtifactStorageService } from './exports/artifact.storage.js';
import { auditService, type AuditService } from '../audit/audit.service.js';
import {
  type ReportType,
  type ExportFormat,
  type CreateScheduledReport,
  type UpdateScheduledReport,
  type ScheduledReportResponse,
  type ReportRunResponse,
  ProductionPerformanceFilterSchema,
  InspectionSummaryFilterSchema,
  DefectAnalysisFilterSchema,
  CapaStatusFilterSchema,
  SpcSummaryReportFilterSchema,
  type ProductionPerformanceReport,
  type InspectionSummaryReport,
  type DefectAnalysisReport,
  type CapaStatusReport,
  type SpcSummaryReport,
} from '@qualityops/contracts';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware.js';

export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository = reportsRepository,
    private readonly schedulesRepo: SchedulesRepository = schedulesRepository,
    private readonly storage: ArtifactStorageService = artifactStorage,
    private readonly audit: AuditService = auditService,
  ) {}

  /**
   * Generates validated report data based on report type and filters.
   */
  public async getReportData(
    reportType: ReportType,
    rawFilters: Record<string, unknown>,
  ): Promise<
    | ProductionPerformanceReport
    | InspectionSummaryReport
    | DefectAnalysisReport
    | CapaStatusReport
    | SpcSummaryReport
  > {
    switch (reportType) {
      case 'production-performance': {
        const parsed = ProductionPerformanceFilterSchema.safeParse(rawFilters);
        if (!parsed.success) {
          throw new BadRequestError(`Invalid report filters: ${parsed.error.message}`);
        }
        return this.repo.getProductionPerformanceReport(parsed.data);
      }

      case 'inspection-summary': {
        const parsed = InspectionSummaryFilterSchema.safeParse(rawFilters);
        if (!parsed.success) {
          throw new BadRequestError(`Invalid report filters: ${parsed.error.message}`);
        }
        return this.repo.getInspectionSummaryReport(parsed.data);
      }

      case 'defect-analysis': {
        const parsed = DefectAnalysisFilterSchema.safeParse(rawFilters);
        if (!parsed.success) {
          throw new BadRequestError(`Invalid report filters: ${parsed.error.message}`);
        }
        return this.repo.getDefectAnalysisReport(parsed.data);
      }

      case 'capa-status': {
        const parsed = CapaStatusFilterSchema.safeParse(rawFilters);
        if (!parsed.success) {
          throw new BadRequestError(`Invalid report filters: ${parsed.error.message}`);
        }
        return this.repo.getCapaStatusReport(parsed.data);
      }

      case 'spc-summary': {
        const parsed = SpcSummaryReportFilterSchema.safeParse(rawFilters);
        if (!parsed.success) {
          throw new BadRequestError(`Invalid report filters: ${parsed.error.message}`);
        }
        const spcResponse = await spcService.getPChart(parsed.data);
        return {
          reportType: 'spc-summary',
          generatedAt: new Date().toISOString(),
          filters: parsed.data as Record<string, unknown>,
          spcResponse,
        };
      }

      default: {
        const exhaustiveCheck: never = reportType;
        throw new BadRequestError(`Unsupported report type: ${String(exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Generates a downloadable export (CSV, XLSX, PDF) using the exact same service-level data.
   */
  public async exportReport(
    reportType: ReportType,
    filters: Record<string, unknown>,
    format: ExportFormat,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const data = await this.getReportData(reportType, filters);
    const dateStr = new Date().toISOString().slice(0, 10);
    const baseFilename = `qualityops-${reportType}-${dateStr}`;

    switch (format) {
      case 'CSV': {
        const { headers, rows } = this.extractCsvData(reportType, data);
        const csvContent = generateCsv(headers, rows);
        return {
          buffer: Buffer.from(csvContent, 'utf-8'),
          filename: `${baseFilename}.csv`,
          contentType: 'text/csv; charset=utf-8',
        };
      }

      case 'XLSX': {
        const { columns, rows, summary } = this.extractTabularData(reportType, data);
        const buffer = await generateXlsx({
          sheetName: reportType,
          columns,
          rows,
          summary,
        });
        return {
          buffer,
          filename: `${baseFilename}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
      }

      case 'PDF': {
        const { columns, rows, summary, title, notes } = this.extractPdfData(reportType, data);
        const buffer = await generatePdf({
          title,
          reportType,
          generatedAt: data.generatedAt,
          filters: data.filters,
          summary,
          columns,
          rows,
          notes,
        });
        return {
          buffer,
          filename: `${baseFilename}.pdf`,
          contentType: 'application/pdf',
        };
      }

      default:
        throw new BadRequestError(`Unsupported export format: ${String(format)}`);
    }
  }

  /**
   * Scheduled Reports Management
   */
  public async listSchedules(): Promise<ScheduledReportResponse[]> {
    return this.schedulesRepo.listSchedules();
  }

  public async getSchedule(id: string): Promise<ScheduledReportResponse> {
    const schedule = await this.schedulesRepo.getScheduleById(id);
    if (!schedule) {
      throw new NotFoundError(`Scheduled report "${id}" not found`);
    }
    return schedule;
  }

  public async createSchedule(
    input: CreateScheduledReport,
    userId: string,
  ): Promise<ScheduledReportResponse> {
    // Validate filters against report schema
    await this.getReportData(input.reportType, {
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
      to: new Date().toISOString(),
      ...input.filters,
    });

    const created = await this.schedulesRepo.createSchedule(input, userId);
    await this.audit.record({
      actorId: userId,
      action: 'CREATE',
      entityType: 'SCHEDULED_REPORT',
      entityId: created.id,
      afterState: created as unknown as Record<string, unknown>,
    });
    return created;
  }

  public async updateSchedule(
    id: string,
    input: UpdateScheduledReport,
    userId: string,
  ): Promise<ScheduledReportResponse> {
    const existing = await this.getSchedule(id);
    const updated = await this.schedulesRepo.updateSchedule(id, input);
    if (!updated) {
      throw new NotFoundError(`Scheduled report "${id}" not found`);
    }
    await this.audit.record({
      actorId: userId,
      action: 'UPDATE',
      entityType: 'SCHEDULED_REPORT',
      entityId: id,
      beforeState: existing as unknown as Record<string, unknown>,
      afterState: updated as unknown as Record<string, unknown>,
    });
    return updated;
  }

  public async listRunsForSchedule(id: string): Promise<ReportRunResponse[]> {
    await this.getSchedule(id); // ensure exists
    return this.schedulesRepo.listRunsForSchedule(id);
  }

  /**
   * Runs a single scheduled report, writes its export artifact, and updates run state.
   */
  public async executeSingleSchedule(
    schedule: ScheduledReportResponse,
  ): Promise<ReportRunResponse> {
    // Compute dynamic date range for the run (e.g. past 7 days for DAILY/WEEKLY, past 30 days for MONTHLY)
    const now = new Date();
    const daysLookback = schedule.cadence === 'DAILY' ? 1 : schedule.cadence === 'WEEKLY' ? 7 : 30;
    const fromDate = new Date(now.getTime() - daysLookback * 86400000);

    const runFilters = {
      ...schedule.filters,
      from: fromDate.toISOString(),
      to: now.toISOString(),
    };

    const run = await this.schedulesRepo.createReportRun({
      scheduledReportId: schedule.id,
      reportType: schedule.reportType,
      format: schedule.format,
      filters: runFilters,
      status: 'RUNNING',
    });

    try {
      const { buffer } = await this.exportReport(schedule.reportType, runFilters, schedule.format);
      const artifactId = randomUUID();
      const saved = await this.storage.saveArtifact(artifactId, schedule.format, buffer);

      await this.schedulesRepo.completeReportRun(run.id, {
        status: 'SUCCEEDED',
        artifactId,
        artifactPath: saved.filePath,
        fileSizeBytes: saved.sizeBytes,
      });

      return {
        ...run,
        status: 'SUCCEEDED',
        artifactId,
        fileSizeBytes: saved.sizeBytes,
        completedAt: new Date().toISOString(),
      };
    } catch (err) {
      const safeError = err instanceof Error ? err.message : 'Unknown generation failure';
      await this.schedulesRepo.completeReportRun(run.id, {
        status: 'FAILED',
        errorMessage: safeError,
      });

      return {
        ...run,
        status: 'FAILED',
        errorMessage: safeError,
        completedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * One-shot scheduler worker method: claims due schedules atomically and processes them.
   */
  public async processDueSchedules(limit = 10): Promise<{ processed: number; errors: string[] }> {
    const client: PoolClient = await pool.connect();
    let processed = 0;
    const errors: string[] = [];

    try {
      await client.query('BEGIN;');
      const dueSchedules = await this.schedulesRepo.claimDueSchedules(limit, client);

      for (const schedule of dueSchedules) {
        // Advance schedule immediately in transaction so other workers won't double claim
        await this.schedulesRepo.advanceScheduleNextRun(schedule.id, schedule.cadence, client);
      }
      await client.query('COMMIT;');

      // Process claimed schedules outside transaction lock
      for (const schedule of dueSchedules) {
        try {
          await this.executeSingleSchedule(schedule);
          processed++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push(`Failed schedule ${schedule.id} (${schedule.name}): ${errMsg}`);
        }
      }
    } catch (err) {
      await client.query('ROLLBACK;');
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Worker transaction error: ${errMsg}`);
    } finally {
      client.release();
    }

    return { processed, errors };
  }

  /**
   * Download generated report artifact by opaque artifactId.
   */
  public getArtifactDownload(artifactId: string, format: ExportFormat) {
    return this.storage.getArtifactStream(artifactId, format);
  }

  // --------------------------------------------------------------------------
  // Data extraction helpers for CSV, XLSX, and PDF
  // --------------------------------------------------------------------------

  private extractTabularData(
    reportType: ReportType,
    data: unknown,
  ): {
    columns: XlsxColumn[];
    rows: Record<string, unknown>[];
    summary: Record<string, string | number>;
  } {
    switch (reportType) {
      case 'production-performance': {
        const r = data as ProductionPerformanceReport;
        const columns: XlsxColumn[] = [
          { header: 'Batch Number', key: 'batchNumber', width: 18 },
          { header: 'Product Code', key: 'productCode', width: 15 },
          { header: 'Product Name', key: 'productName', width: 24 },
          { header: 'Line Code', key: 'productionLineCode', width: 14 },
          { header: 'Line Name', key: 'productionLineName', width: 18 },
          { header: 'Status', key: 'status', width: 14 },
          { header: 'Planned Qty', key: 'plannedQuantity', width: 14 },
          { header: 'Produced Qty', key: 'producedQuantity', width: 14 },
          { header: 'Accepted Qty', key: 'acceptedQuantity', width: 14 },
          { header: 'Scrap Qty', key: 'scrapQuantity', width: 12 },
          { header: 'Rework Pending', key: 'reworkPendingQuantity', width: 16 },
        ];
        const summary = {
          'Total Batches': r.summary.totalBatches,
          'Total Planned': r.summary.totalPlannedQuantity,
          'Total Produced': r.summary.totalProducedQuantity,
          'Total Accepted': r.summary.totalAcceptedQuantity,
          'Total Scrap': r.summary.totalScrapQuantity,
          'Overall Scrap Rate': `${(r.summary.overallScrapRate * 100).toFixed(2)}%`,
          'Total Downtime Duration (s)': r.summary.totalDowntimeDurationSeconds,
        };
        return { columns, rows: r.rows as unknown as Record<string, unknown>[], summary };
      }

      case 'inspection-summary': {
        const r = data as InspectionSummaryReport;
        const columns: XlsxColumn[] = [
          { header: 'Inspection #', key: 'inspectionNumber', width: 20 },
          { header: 'Batch #', key: 'batchNumber', width: 16 },
          { header: 'Product', key: 'productCode', width: 14 },
          { header: 'Line', key: 'productionLineName', width: 18 },
          { header: 'Inspector', key: 'inspectorName', width: 18 },
          { header: 'Stage', key: 'stage', width: 14 },
          { header: 'Status', key: 'status', width: 14 },
          { header: 'Result', key: 'result', width: 12 },
          { header: 'Sample Size', key: 'sampleSize', width: 13 },
          { header: 'Passed Units', key: 'passedUnits', width: 13 },
          { header: 'Failed Units', key: 'failedUnits', width: 13 },
          { header: 'Failure Proportion', key: 'failureProportion', width: 18 },
        ];
        const summary = {
          'Completed Inspections': r.summary.completedInspections,
          'Total Sample Units': r.summary.totalSampleUnits,
          'Total Passed Units': r.summary.totalPassedUnits,
          'Total Failed Units': r.summary.totalFailedUnits,
          'Pooled Failure Proportion':
            r.summary.pooledFailureProportion !== null
              ? `${(r.summary.pooledFailureProportion * 100).toFixed(2)}%`
              : 'N/A',
        };
        return { columns, rows: r.rows as unknown as Record<string, unknown>[], summary };
      }

      case 'defect-analysis': {
        const r = data as DefectAnalysisReport;
        const columns: XlsxColumn[] = [
          { header: 'Inspection #', key: 'inspectionNumber', width: 20 },
          { header: 'Batch #', key: 'batchNumber', width: 16 },
          { header: 'Defect Code', key: 'defectTypeCode', width: 14 },
          { header: 'Defect Name', key: 'defectTypeName', width: 20 },
          { header: 'Category', key: 'category', width: 14 },
          { header: 'Severity', key: 'severity', width: 12 },
          { header: 'Occurrences', key: 'occurrenceCount', width: 14 },
          { header: 'Affected Units', key: 'affectedUnitCount', width: 15 },
          { header: 'Notes', key: 'notes', width: 24 },
        ];
        const summary = {
          'Total Findings': r.summary.totalFindings,
          'Total Occurrences': r.summary.totalOccurrences,
          'Total Affected Units': r.summary.totalAffectedUnits,
          'Critical Severity Findings': r.summary.severityBreakdown.CRITICAL ?? 0,
        };
        return { columns, rows: r.rows as unknown as Record<string, unknown>[], summary };
      }

      case 'capa-status': {
        const r = data as CapaStatusReport;
        const columns: XlsxColumn[] = [
          { header: 'Case #', key: 'caseNumber', width: 18 },
          { header: 'Title', key: 'title', width: 26 },
          { header: 'Status', key: 'status', width: 14 },
          { header: 'Priority', key: 'priority', width: 12 },
          { header: 'Source', key: 'source', width: 18 },
          { header: 'Due Date', key: 'dueDate', width: 14 },
          { header: 'Overdue?', key: 'isOverdue', width: 12 },
          { header: 'Total Actions', key: 'totalActions', width: 13 },
          { header: 'Completed Actions', key: 'completedActions', width: 16 },
          { header: 'Verified By', key: 'verifiedBy', width: 18 },
        ];
        const summary = {
          'Total Cases': r.summary.totalCases,
          'Overdue Cases': r.summary.overdueCasesCount,
          'Total Actions': r.summary.totalActions,
          'Action Completion Rate': `${(r.summary.actionCompletionRate * 100).toFixed(1)}%`,
          'Verified Cases': r.summary.verifiedCasesCount,
        };
        return { columns, rows: r.rows as unknown as Record<string, unknown>[], summary };
      }

      case 'spc-summary': {
        const r = data as SpcSummaryReport;
        const columns: XlsxColumn[] = [
          { header: 'Inspection #', key: 'inspectionNumber', width: 20 },
          { header: 'Batch #', key: 'batchNumber', width: 16 },
          { header: 'Sample Size', key: 'sampleSize', width: 13 },
          { header: 'Failed Units', key: 'failedUnits', width: 13 },
          { header: 'Observed p', key: 'observedProportion', width: 14 },
          { header: 'Center Line', key: 'centerLine', width: 13 },
          { header: 'UCL', key: 'upperControlLimit', width: 12 },
          { header: 'LCL', key: 'lowerControlLimit', width: 12 },
          { header: 'Signal?', key: 'signal', width: 10 },
          { header: 'Signal Reason', key: 'signalReason', width: 16 },
        ];
        const summary = {
          'SPC Status': r.spcResponse.status,
          'Subgroup Count': r.spcResponse.baseline.subgroupCount,
          'Baseline p-bar':
            r.spcResponse.baseline.pBar !== null ? r.spcResponse.baseline.pBar.toFixed(4) : 'N/A',
          'Signal Count': r.spcResponse.summary.signalCount,
        };
        return {
          columns,
          rows: r.spcResponse.points as unknown as Record<string, unknown>[],
          summary,
        };
      }
    }
  }

  private extractCsvData(
    reportType: ReportType,
    data: unknown,
  ): { headers: string[]; rows: (string | number | boolean | null | undefined)[][] } {
    const { columns, rows } = this.extractTabularData(reportType, data);
    const headers = columns.map((c) => c.header);
    const formattedRows = rows.map((row) =>
      columns.map((col) => {
        const val = row[col.key];
        if (val === null || val === undefined) return '';
        if (typeof val === 'number' || typeof val === 'boolean') return val;
        return String(val);
      }),
    );
    return { headers, rows: formattedRows };
  }

  private extractPdfData(
    reportType: ReportType,
    data: unknown,
  ): {
    title: string;
    columns: PdfColumn[];
    rows: Record<string, unknown>[];
    summary: Record<string, string | number>;
    notes?: string[];
  } {
    const { columns, rows, summary } = this.extractTabularData(reportType, data);

    let title = 'QualityOps Manufacturing Report';
    let notes: string[] | undefined;

    switch (reportType) {
      case 'production-performance':
        title = 'Production Performance & Batch Reconciliation Report';
        notes = [
          'Production quantities reflect confirmed lifecycle dispositions. Inspection samples are not batch scrap.',
        ];
        break;
      case 'inspection-summary':
        title = 'Quality Inspection Outcomes & Pooled Failure Rate Report';
        notes = [
          'Pooled failure proportion uses completed inspections sample sizes only. Cancelled/in-progress are excluded.',
        ];
        break;
      case 'defect-analysis':
        title = 'Defect Analysis & Pareto Ranking Report';
        notes = [
          'Finding records, occurrence counts, and affected physical units are distinct measures.',
        ];
        break;
      case 'capa-status':
        title = 'Corrective and Preventive Action (CAPA) Status Report';
        notes = ['Overdue status evaluates non-closed cases with passed due dates.'];
        break;
      case 'spc-summary': {
        const spc = data as SpcSummaryReport;
        title = 'Statistical Process Control (SPC) p-Chart Summary Report';
        notes = [
          spc.spcResponse.status === 'READY'
            ? 'Process control limits reflect 3-sigma natural process variation. A signal prompts investigation, not proof of non-conformance.'
            : spc.spcResponse.status === 'INSUFFICIENT_DATA'
              ? 'INSUFFICIENT DATA: Fewer than 20 subgroups available. Limits are withheld per statistical guardrails.'
              : 'DEGENERATE BASELINE: Baseline proportion is 0 or 1. Conventional limits are mathematically uninformative.',
        ];
        break;
      }
    }

    return { title, columns, rows, summary, notes };
  }
}

export const reportsService = new ReportsService();
