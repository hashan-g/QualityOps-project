import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../../infrastructure/database/pool.js';
import type {
  OperationalAlert,
  AlertListFilter,
  AlertRuleType,
  AlertSeverity,
  AlertStatus,
} from '@qualityops/contracts';

export class AlertsRepository {
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
   * List paginated operational alerts with optional filters.
   */
  public async listAlerts(
    filter: AlertListFilter,
    client?: PoolClient,
  ): Promise<{ alerts: OperationalAlert[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (filter.status) {
      conditions.push(`status = $${pIdx++}`);
      params.push(filter.status);
    }
    if (filter.ruleType) {
      conditions.push(`rule_type = $${pIdx++}`);
      params.push(filter.ruleType);
    }
    if (filter.severity) {
      conditions.push(`severity = $${pIdx++}`);
      params.push(filter.severity);
    }
    if (filter.from) {
      conditions.push(`created_at >= $${pIdx++}`);
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push(`created_at <= $${pIdx++}`);
      params.push(filter.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*)::int AS total FROM operational_alerts ${whereClause};`;
    const countRes = await this.query<{ total: number }>(client, countSql, params);
    const total = countRes.rows[0]?.total ?? 0;

    const listSql = `
      SELECT
        id, rule_type, severity, status, title, message, fingerprint,
        entity_type, entity_id, context_data, acknowledged_by, acknowledged_at,
        resolved_by, resolved_at, resolution_notes, created_at, updated_at
      FROM operational_alerts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++};
    `;
    params.push(filter.limit, filter.offset);

    const listRes = await this.query(client, listSql, params);
    return {
      alerts: listRes.rows.map(this.mapAlertRow),
      total,
    };
  }

  /**
   * Get alert by ID.
   */
  public async getAlertById(id: string, client?: PoolClient): Promise<OperationalAlert | null> {
    const sql = `
      SELECT
        id, rule_type, severity, status, title, message, fingerprint,
        entity_type, entity_id, context_data, acknowledged_by, acknowledged_at,
        resolved_by, resolved_at, resolution_notes, created_at, updated_at
      FROM operational_alerts
      WHERE id = $1;
    `;
    const res = await this.query(client, sql, [id]);
    return res.rows[0] ? this.mapAlertRow(res.rows[0]) : null;
  }

  /**
   * Insert a new operational alert idempotently using ON CONFLICT DO NOTHING.
   * If an active (OPEN/ACKNOWLEDGED) alert with the same fingerprint already exists,
   * no duplicate is created and null is returned.
   */
  public async createAlertIdempotent(
    data: {
      ruleType: AlertRuleType;
      severity: AlertSeverity;
      title: string;
      message: string;
      fingerprint: string;
      entityType: string;
      entityId: string;
      contextData: Record<string, unknown>;
    },
    client?: PoolClient,
  ): Promise<OperationalAlert | null> {
    const sql = `
      INSERT INTO operational_alerts (
        rule_type, severity, status, title, message, fingerprint,
        entity_type, entity_id, context_data
      ) VALUES ($1, $2, 'OPEN', $3, $4, $5, $6, $7, $8)
      ON CONFLICT (fingerprint) WHERE status IN ('OPEN', 'ACKNOWLEDGED') DO NOTHING
      RETURNING *;
    `;
    const params = [
      data.ruleType,
      data.severity,
      data.title,
      data.message,
      data.fingerprint,
      data.entityType,
      data.entityId,
      JSON.stringify(data.contextData),
    ];

    const res = await this.query(client, sql, params);
    return res.rows[0] ? this.mapAlertRow(res.rows[0]) : null;
  }

  /**
   * Acknowledge an alert (must be in OPEN status).
   */
  public async acknowledgeAlert(
    id: string,
    userId: string,
    client?: PoolClient,
  ): Promise<OperationalAlert | null> {
    const sql = `
      UPDATE operational_alerts
      SET
        status = 'ACKNOWLEDGED',
        acknowledged_by = $2,
        acknowledged_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND status = 'OPEN'
      RETURNING *;
    `;
    const res = await this.query(client, sql, [id, userId]);
    return res.rows[0] ? this.mapAlertRow(res.rows[0]) : null;
  }

  /**
   * Resolve an alert with required notes (must be OPEN or ACKNOWLEDGED).
   */
  public async resolveAlert(
    id: string,
    userId: string,
    notes: string,
    client?: PoolClient,
  ): Promise<OperationalAlert | null> {
    const sql = `
      UPDATE operational_alerts
      SET
        status = 'RESOLVED',
        resolved_by = $2,
        resolved_at = NOW(),
        resolution_notes = $3,
        updated_at = NOW()
      WHERE id = $1 AND status IN ('OPEN', 'ACKNOWLEDGED')
      RETURNING *;
    `;
    const res = await this.query(client, sql, [id, userId, notes]);
    return res.rows[0] ? this.mapAlertRow(res.rows[0]) : null;
  }

  private mapAlertRow(row: Record<string, unknown>): OperationalAlert {
    return {
      id: String(row.id),
      ruleType: row.rule_type as AlertRuleType,
      severity: row.severity as AlertSeverity,
      status: row.status as AlertStatus,
      title: String(row.title),
      message: String(row.message),
      fingerprint: String(row.fingerprint),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      contextData: (typeof row.context_data === 'string'
        ? JSON.parse(row.context_data)
        : row.context_data) as Record<string, unknown>,
      acknowledgedBy: row.acknowledged_by ? String(row.acknowledged_by) : null,
      acknowledgedAt: row.acknowledged_at
        ? new Date(row.acknowledged_at as string | Date).toISOString()
        : null,
      resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as string | Date).toISOString() : null,
      resolutionNotes: row.resolution_notes ? String(row.resolution_notes) : null,
      createdAt: new Date(row.created_at as string | Date).toISOString(),
      updatedAt: new Date(row.updated_at as string | Date).toISOString(),
    };
  }
}

export const alertsRepository = new AlertsRepository();
