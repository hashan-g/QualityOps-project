import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../../infrastructure/database/pool.js';
import type {
  CreateScheduledReport,
  UpdateScheduledReport,
  ScheduledReportResponse,
  ReportRunResponse,
  ScheduleCadence,
  ExportFormat,
  ReportType,
  ReportRunStatus,
} from '@qualityops/contracts';

export function calculateNextRunTime(cadence: ScheduleCadence, fromDate = new Date()): Date {
  const next = new Date(fromDate);
  if (cadence === 'DAILY') {
    next.setDate(next.getDate() + 1);
  } else if (cadence === 'WEEKLY') {
    next.setDate(next.getDate() + 7);
  } else if (cadence === 'MONTHLY') {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

export class SchedulesRepository {
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
   * List scheduled reports.
   */
  public async listSchedules(client?: PoolClient): Promise<ScheduledReportResponse[]> {
    const sql = `
      SELECT
        id, name, report_type, filters, format, cadence, timezone,
        is_enabled, created_by, next_run_at, last_run_at, recipients, created_at, updated_at
      FROM scheduled_reports
      ORDER BY created_at DESC;
    `;
    const res = await this.query(client, sql);
    return res.rows.map(this.mapScheduledReportRow);
  }

  /**
   * Get single schedule by ID.
   */
  public async getScheduleById(
    id: string,
    client?: PoolClient,
  ): Promise<ScheduledReportResponse | null> {
    const sql = `
      SELECT
        id, name, report_type, filters, format, cadence, timezone,
        is_enabled, created_by, next_run_at, last_run_at, recipients, created_at, updated_at
      FROM scheduled_reports
      WHERE id = $1;
    `;
    const res = await this.query(client, sql, [id]);
    return res.rows[0] ? this.mapScheduledReportRow(res.rows[0]) : null;
  }

  /**
   * Create a new scheduled report.
   */
  public async createSchedule(
    input: CreateScheduledReport,
    createdBy: string,
    client?: PoolClient,
  ): Promise<ScheduledReportResponse> {
    const nextRunAt = calculateNextRunTime(input.cadence);

    const sql = `
      INSERT INTO scheduled_reports (
        name, report_type, filters, format, cadence, timezone, is_enabled, created_by, next_run_at, recipients
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;
    const params = [
      input.name,
      input.reportType,
      JSON.stringify(input.filters ?? {}),
      input.format,
      input.cadence,
      input.timezone,
      input.isEnabled ?? true,
      createdBy,
      nextRunAt.toISOString(),
      JSON.stringify(input.recipients ?? []),
    ];

    const res = await this.query(client, sql, params);
    return this.mapScheduledReportRow(res.rows[0]!);
  }

  /**
   * Update an existing schedule.
   */
  public async updateSchedule(
    id: string,
    input: UpdateScheduledReport,
    client?: PoolClient,
  ): Promise<ScheduledReportResponse | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [id];
    let pIdx = 2;

    if (input.name !== undefined) {
      updates.push(`name = $${pIdx++}`);
      params.push(input.name);
    }
    if (input.filters !== undefined) {
      updates.push(`filters = $${pIdx++}`);
      params.push(JSON.stringify(input.filters));
    }
    if (input.format !== undefined) {
      updates.push(`format = $${pIdx++}`);
      params.push(input.format);
    }
    if (input.cadence !== undefined) {
      updates.push(`cadence = $${pIdx++}`);
      params.push(input.cadence);
    }
    if (input.timezone !== undefined) {
      updates.push(`timezone = $${pIdx++}`);
      params.push(input.timezone);
    }
    if (input.isEnabled !== undefined) {
      updates.push(`is_enabled = ${pIdx++}`);
      params.push(input.isEnabled);
    }
    if (input.recipients !== undefined) {
      updates.push(`recipients = ${pIdx++}`);
      params.push(JSON.stringify(input.recipients));
    }

    const sql = `
      UPDATE scheduled_reports
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.query(client, sql, params);
    return res.rows[0] ? this.mapScheduledReportRow(res.rows[0]) : null;
  }

  /**
   * Claim due schedules for execution using transactional row-level lock (FOR UPDATE SKIP LOCKED).
   * Prevents concurrent workers from executing the same schedule twice.
   */
  public async claimDueSchedules(
    limit: number,
    client: PoolClient,
  ): Promise<ScheduledReportResponse[]> {
    const sql = `
      SELECT *
      FROM scheduled_reports
      WHERE is_enabled = true AND next_run_at <= NOW()
      ORDER BY next_run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $1;
    `;
    const res = await client.query(sql, [limit]);
    return res.rows.map(this.mapScheduledReportRow);
  }

  /**
   * Advance schedule to its next due run time after a run completes (or fails).
   */
  public async advanceScheduleNextRun(
    id: string,
    cadence: ScheduleCadence,
    client: PoolClient,
  ): Promise<void> {
    const nextRun = calculateNextRunTime(cadence);
    const sql = `
      UPDATE scheduled_reports
      SET next_run_at = $2, last_run_at = NOW(), updated_at = NOW()
      WHERE id = $1;
    `;
    await client.query(sql, [id, nextRun.toISOString()]);
  }

  /**
   * Insert a new report execution run.
   */
  public async createReportRun(
    data: {
      scheduledReportId?: string | null | undefined;
      reportType: ReportType;
      format: ExportFormat;
      filters: Record<string, unknown>;
      status: ReportRunStatus;
      triggeredBy?: string | null | undefined;
    },
    client?: PoolClient,
  ): Promise<ReportRunResponse> {
    const sql = `
      INSERT INTO report_runs (
        scheduled_report_id, report_type, format, filters, status, started_at, triggered_by
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      RETURNING *;
    `;
    const params = [
      data.scheduledReportId ?? null,
      data.reportType,
      data.format,
      JSON.stringify(data.filters ?? {}),
      data.status,
      data.triggeredBy ?? null,
    ];
    const res = await this.query(client, sql, params);
    return this.mapReportRunRow(res.rows[0]!);
  }

  /**
   * Complete a report run (SUCCEEDED or FAILED).
   */
  public async completeReportRun(
    runId: string,
    data: {
      status: 'SUCCEEDED' | 'FAILED';
      artifactId?: string | null | undefined;
      artifactPath?: string | null | undefined;
      fileSizeBytes?: number | null | undefined;
      errorMessage?: string | null | undefined;
    },
    client?: PoolClient,
  ): Promise<void> {
    const sql = `
      UPDATE report_runs
      SET
        status = $2,
        artifact_id = $3,
        artifact_path = $4,
        file_size_bytes = $5,
        error_message = $6,
        completed_at = NOW()
      WHERE id = $1;
    `;
    await this.query(client, sql, [
      runId,
      data.status,
      data.artifactId ?? null,
      data.artifactPath ?? null,
      data.fileSizeBytes ?? null,
      data.errorMessage ?? null,
    ]);
  }

  /**
   * Get run history for a schedule.
   */
  public async listRunsForSchedule(
    scheduledReportId: string,
    limit = 20,
    client?: PoolClient,
  ): Promise<ReportRunResponse[]> {
    const sql = `
      SELECT *
      FROM report_runs
      WHERE scheduled_report_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `;
    const res = await this.query(client, sql, [scheduledReportId, limit]);
    return res.rows.map(this.mapReportRunRow);
  }

  /**
   * Get run by artifact ID.
   */
  public async getRunByArtifactId(
    artifactId: string,
    client?: PoolClient,
  ): Promise<ReportRunResponse | null> {
    const sql = `
      SELECT *
      FROM report_runs
      WHERE artifact_id = $1;
    `;
    const res = await this.query(client, sql, [artifactId]);
    return res.rows[0] ? this.mapReportRunRow(res.rows[0]) : null;
  }

  private mapScheduledReportRow(row: Record<string, unknown>): ScheduledReportResponse {
    return {
      id: String(row.id),
      name: String(row.name),
      reportType: row.report_type as ReportType,
      filters: (typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters) as Record<
        string,
        unknown
      >,
      format: row.format as ExportFormat,
      cadence: row.cadence as ScheduleCadence,
      timezone: String(row.timezone),
      isEnabled: Boolean(row.is_enabled),
      createdBy: row.created_by ? String(row.created_by) : null,
      nextRunAt: new Date(row.next_run_at as string | Date).toISOString(),
      lastRunAt: row.last_run_at ? new Date(row.last_run_at as string | Date).toISOString() : null,
      recipients: Array.isArray(row.recipients)
        ? (row.recipients as string[])
        : typeof row.recipients === 'string'
          ? JSON.parse(row.recipients)
          : [],
      createdAt: new Date(row.created_at as string | Date).toISOString(),
      updatedAt: new Date(row.updated_at as string | Date).toISOString(),
    };
  }

  private mapReportRunRow(row: Record<string, unknown>): ReportRunResponse {
    return {
      id: String(row.id),
      scheduledReportId: row.scheduled_report_id ? String(row.scheduled_report_id) : null,
      reportType: row.report_type as ReportType,
      format: row.format as ExportFormat,
      filters: (typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters) as Record<
        string,
        unknown
      >,
      status: row.status as ReportRunStatus,
      artifactId: row.artifact_id ? String(row.artifact_id) : null,
      fileSizeBytes:
        row.file_size_bytes !== null && row.file_size_bytes !== undefined
          ? Number(row.file_size_bytes)
          : null,
      errorMessage: row.error_message ? String(row.error_message) : null,
      startedAt: row.started_at ? new Date(row.started_at as string | Date).toISOString() : null,
      completedAt: row.completed_at
        ? new Date(row.completed_at as string | Date).toISOString()
        : null,
      triggeredBy: row.triggered_by ? String(row.triggered_by) : null,
      createdAt: new Date(row.created_at as string | Date).toISOString(),
    };
  }
}

export const schedulesRepository = new SchedulesRepository();
