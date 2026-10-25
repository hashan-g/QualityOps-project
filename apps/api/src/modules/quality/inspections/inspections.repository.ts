import type { PoolClient, QueryResult } from 'pg';
import { pool } from '../../../infrastructure/database/pool.js';
import type {
  InspectionListQuery,
  InspectionListResponse,
  QualityInspection,
} from '@qualityops/contracts';

export interface QualityInspectionDbRow {
  id: string;
  inspection_number: string;
  batch_id: string;
  inspector_id: string;
  stage: string;
  attempt_number: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  result: 'PASS' | 'FAIL' | 'CONDITIONAL' | null;
  sample_size: number;
  passed_units: number;
  failed_units: number;
  inspected_at: Date | string;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  batch_number?: string;
  product_code?: string;
  product_name?: string;
  inspector_username?: string;
  inspector_full_name?: string;
}

export function mapDbRowToInspection(row: QualityInspectionDbRow): QualityInspection {
  return {
    id: row.id,
    inspectionNumber: row.inspection_number,
    batchId: row.batch_id,
    inspectorId: row.inspector_id,
    stage: row.stage,
    attemptNumber: row.attempt_number,
    status: row.status,
    result: row.result,
    sampleSize: row.sample_size,
    passedUnits: row.passed_units,
    failedUnits: row.failed_units,
    inspectedAt: new Date(row.inspected_at).toISOString(),
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    batchNumber: row.batch_number,
    productCode: row.product_code,
    productName: row.product_name,
    inspectorUsername: row.inspector_username,
    inspectorFullName: row.inspector_full_name,
  };
}

export interface CreateInspectionDbParams {
  inspectionNumber: string;
  batchId: string;
  inspectorId: string;
  stage: string;
  attemptNumber: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  result: 'PASS' | 'FAIL' | 'CONDITIONAL' | null;
  sampleSize: number;
  passedUnits: number;
  failedUnits: number;
  inspectedAt?: string | undefined;
  notes?: string | null | undefined;
}

export interface UpdateInspectionDbParams {
  sampleSize?: number | undefined;
  passedUnits?: number | undefined;
  failedUnits?: number | undefined;
  status?: ('IN_PROGRESS' | 'COMPLETED' | 'CANCELLED') | undefined;
  result?: ('PASS' | 'FAIL' | 'CONDITIONAL' | null) | undefined;
  notes?: string | null | undefined;
  inspectedAt?: string | undefined;
}

export class InspectionsRepository {
  public async list(query: InspectionListQuery): Promise<InspectionListResponse> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (query.batchId) {
      conditions.push(`qi.batch_id = $${paramIndex++}`);
      values.push(query.batchId);
    }

    if (query.stage) {
      conditions.push(`qi.stage = $${paramIndex++}`);
      values.push(query.stage);
    }

    if (query.status) {
      conditions.push(`qi.status = $${paramIndex++}`);
      values.push(query.status);
    }

    if (query.result) {
      conditions.push(`qi.result = $${paramIndex++}`);
      values.push(query.result);
    }

    if (query.inspectorId) {
      conditions.push(`qi.inspector_id = $${paramIndex++}`);
      values.push(query.inspectorId);
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
        `(qi.inspection_number ILIKE $${paramIndex} OR pb.batch_number ILIKE $${paramIndex} OR p.code ILIKE $${paramIndex} OR p.name ILIKE $${paramIndex})`,
      );
      values.push(term);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM quality_inspections qi
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      JOIN users u ON qi.inspector_id = u.id
      ${whereClause};
    `;
    const countResult = await pool.query<{ total: number }>(countQuery, values);
    const total = countResult.rows[0]?.total ?? 0;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const selectQuery = `
      SELECT
        qi.*,
        pb.batch_number,
        p.code AS product_code,
        p.name AS product_name,
        u.username AS inspector_username,
        u.full_name AS inspector_full_name
      FROM quality_inspections qi
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      JOIN users u ON qi.inspector_id = u.id
      ${whereClause}
      ORDER BY qi.inspected_at DESC, qi.created_at DESC, qi.id ASC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;
    const queryValues = [...values, limit, offset];
    const result = await pool.query<QualityInspectionDbRow>(selectQuery, queryValues);

    const items = result.rows.map(mapDbRowToInspection);
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  public async findById(id: string, client?: PoolClient): Promise<QualityInspection | null> {
    const query = `
      SELECT
        qi.*,
        pb.batch_number,
        p.code AS product_code,
        p.name AS product_name,
        u.username AS inspector_username,
        u.full_name AS inspector_full_name
      FROM quality_inspections qi
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      JOIN users u ON qi.inspector_id = u.id
      WHERE qi.id = $1;
    `;
    const res = client
      ? await client.query<QualityInspectionDbRow>(query, [id])
      : await pool.query<QualityInspectionDbRow>(query, [id]);
    const row = res.rows[0];
    return row ? mapDbRowToInspection(row) : null;
  }

  public async findByBatchStageAttempt(
    batchId: string,
    stage: string,
    attemptNumber: number,
    client?: PoolClient,
  ): Promise<QualityInspection | null> {
    const query = `
      SELECT
        qi.*,
        pb.batch_number,
        p.code AS product_code,
        p.name AS product_name,
        u.username AS inspector_username,
        u.full_name AS inspector_full_name
      FROM quality_inspections qi
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      JOIN users u ON qi.inspector_id = u.id
      WHERE qi.batch_id = $1 AND qi.stage = $2 AND qi.attempt_number = $3;
    `;
    const res = client
      ? await client.query<QualityInspectionDbRow>(query, [batchId, stage, attemptNumber])
      : await pool.query<QualityInspectionDbRow>(query, [batchId, stage, attemptNumber]);
    const row = res.rows[0];
    return row ? mapDbRowToInspection(row) : null;
  }

  public async getNextAttemptNumber(
    batchId: string,
    stage: string,
    client?: PoolClient,
  ): Promise<number> {
    const query = `
      SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt
      FROM quality_inspections
      WHERE batch_id = $1 AND stage = $2;
    `;
    const res = client
      ? await client.query<{ next_attempt: number }>(query, [batchId, stage])
      : await pool.query<{ next_attempt: number }>(query, [batchId, stage]);
    return res.rows[0]?.next_attempt ?? 1;
  }

  public async generateInspectionNumber(client?: PoolClient): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let i = 0; i < 5; i++) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      const candidate = `INSP-${today}-${rand}`;
      const existing = client
        ? await client.query<{ id: string }>(
            'SELECT id FROM quality_inspections WHERE inspection_number = $1;',
            [candidate],
          )
        : await pool.query<{ id: string }>(
            'SELECT id FROM quality_inspections WHERE inspection_number = $1;',
            [candidate],
          );
      if (existing.rows.length === 0) {
        return candidate;
      }
    }
    // Fallback timestamp high precision
    return `INSP-${today}-${Date.now().toString().slice(-6)}`;
  }

  public async create(
    params: CreateInspectionDbParams,
    client: PoolClient,
  ): Promise<QualityInspection> {
    const query = `
      INSERT INTO quality_inspections (
        inspection_number, batch_id, inspector_id, stage, attempt_number,
        status, result, sample_size, passed_units, failed_units, inspected_at, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        COALESCE($11::timestamptz, CURRENT_TIMESTAMP), $12
      )
      RETURNING *;
    `;
    const values = [
      params.inspectionNumber,
      params.batchId,
      params.inspectorId,
      params.stage,
      params.attemptNumber,
      params.status,
      params.result,
      params.sampleSize,
      params.passedUnits,
      params.failedUnits,
      params.inspectedAt ?? null,
      params.notes ?? null,
    ];

    const res: QueryResult<QualityInspectionDbRow> = await client.query(query, values);
    const createdId = res.rows[0]!.id;

    const fullInspection = await this.findById(createdId, client);
    if (!fullInspection) {
      throw new Error(`Failed to retrieve newly created inspection ${createdId}`);
    }
    return fullInspection;
  }

  public async update(
    id: string,
    params: UpdateInspectionDbParams,
    client: PoolClient,
  ): Promise<QualityInspection> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.sampleSize !== undefined) {
      updates.push(`sample_size = $${paramIndex++}`);
      values.push(params.sampleSize);
    }
    if (params.passedUnits !== undefined) {
      updates.push(`passed_units = $${paramIndex++}`);
      values.push(params.passedUnits);
    }
    if (params.failedUnits !== undefined) {
      updates.push(`failed_units = $${paramIndex++}`);
      values.push(params.failedUnits);
    }
    if (params.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(params.status);
    }
    if (params.result !== undefined) {
      updates.push(`result = $${paramIndex++}`);
      values.push(params.result);
    }
    if (params.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(params.notes);
    }
    if (params.inspectedAt !== undefined) {
      updates.push(`inspected_at = $${paramIndex++}`);
      values.push(params.inspectedAt);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id);
    const query = `
      UPDATE quality_inspections
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *;
    `;

    await client.query(query, values);

    const fullInspection = await this.findById(id, client);
    if (!fullInspection) {
      throw new Error(`Failed to retrieve updated inspection ${id}`);
    }
    return fullInspection;
  }
}

export const inspectionsRepository = new InspectionsRepository();
