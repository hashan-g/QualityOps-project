import type { PoolClient } from 'pg';
import { pool } from '../../infrastructure/database/pool.js';

export interface RecordAuditParams {
  actorId?: string | undefined;
  action: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE' | 'DEACTIVATE' | 'DELETE' | 'CLOSE' | 'CORRECTION';
  entityType:
    | 'PRODUCT'
    | 'PRODUCTION_LINE'
    | 'MACHINE'
    | 'SHIFT'
    | 'DEFECT_TYPE'
    | 'PRODUCTION_BATCH'
    | 'DOWNTIME_RECORD'
    | 'QUALITY_INSPECTION';
  entityId: string;
  requestId?: string | undefined;
  beforeState?: Record<string, unknown> | null | undefined;
  afterState?: Record<string, unknown> | null | undefined;
  ipAddress?: string | undefined;
  client?: PoolClient | undefined;
}

export class AuditService {
  /**
   * Persists an audit log entry in the audit_logs table.
   * If a client is provided, participates in the caller's transaction.
   * Never logs passwords, tokens, or credential material.
   */
  public async record(params: RecordAuditParams): Promise<void> {
    const queryText = `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id, request_id, before_state, after_state, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `;

    const values = [
      params.actorId ?? null,
      params.action,
      params.entityType,
      params.entityId,
      params.requestId ?? null,
      params.beforeState ? JSON.stringify(params.beforeState) : null,
      params.afterState ? JSON.stringify(params.afterState) : null,
      params.ipAddress ?? null,
    ];

    if (params.client) {
      await params.client.query(queryText, values);
    } else {
      await pool.query(queryText, values);
    }
  }
}

export const auditService = new AuditService();
