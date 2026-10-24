import type { PoolClient } from 'pg';
import { pool } from '../../../infrastructure/database/pool.js';
import type { BatchStatus, ProductionBatch, ProductionBatchListQuery } from '@qualityops/contracts';

export interface ProductionBatchDbRow {
  id: string;
  batch_number: string;
  product_id: string;
  product_code?: string | null | undefined;
  product_name?: string | null | undefined;
  production_line_id: string;
  production_line_code?: string | null | undefined;
  production_line_name?: string | null | undefined;
  shift_id: string;
  shift_code?: string | null | undefined;
  shift_name?: string | null | undefined;
  machine_id: string | null;
  machine_code?: string | null | undefined;
  machine_name?: string | null | undefined;
  created_by: string | null;
  created_by_name?: string | null | undefined;
  status: BatchStatus;
  planned_quantity: number;
  produced_quantity: number;
  accepted_quantity: number;
  scrap_quantity: number;
  rework_pending_quantity: number;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function toProductionBatchDto(row: ProductionBatchDbRow): ProductionBatch {
  return {
    id: row.id,
    batchNumber: row.batch_number,
    productId: row.product_id,
    productCode: row.product_code ?? undefined,
    productName: row.product_name ?? undefined,
    productionLineId: row.production_line_id,
    productionLineCode: row.production_line_code ?? undefined,
    productionLineName: row.production_line_name ?? undefined,
    shiftId: row.shift_id,
    shiftCode: row.shift_code ?? undefined,
    shiftName: row.shift_name ?? undefined,
    machineId: row.machine_id,
    machineCode: row.machine_code ?? undefined,
    machineName: row.machine_name ?? undefined,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? undefined,
    status: row.status,
    plannedQuantity: row.planned_quantity,
    producedQuantity: row.produced_quantity,
    acceptedQuantity: row.accepted_quantity,
    scrapQuantity: row.scrap_quantity,
    reworkPendingQuantity: row.rework_pending_quantity,
    startedAt: row.started_at ? row.started_at.toISOString() : null,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class BatchesRepository {
  public async list(
    query: ProductionBatchListQuery,
  ): Promise<{ items: ProductionBatch[]; total: number }> {
    const offset = (query.page - 1) * query.limit;
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (query.search) {
      conditions.push(`pb.batch_number ILIKE $${paramIndex}`);
      values.push(`%${query.search}%`);
      paramIndex++;
    }

    if (query.productId) {
      conditions.push(`pb.product_id = $${paramIndex}`);
      values.push(query.productId);
      paramIndex++;
    }

    if (query.productionLineId) {
      conditions.push(`pb.production_line_id = $${paramIndex}`);
      values.push(query.productionLineId);
      paramIndex++;
    }

    if (query.machineId) {
      conditions.push(`pb.machine_id = $${paramIndex}`);
      values.push(query.machineId);
      paramIndex++;
    }

    if (query.shiftId) {
      conditions.push(`pb.shift_id = $${paramIndex}`);
      values.push(query.shiftId);
      paramIndex++;
    }

    if (query.status) {
      conditions.push(`pb.status = $${paramIndex}`);
      values.push(query.status);
      paramIndex++;
    }

    if (query.startDate) {
      conditions.push(`COALESCE(pb.started_at, pb.created_at) >= $${paramIndex}`);
      values.push(query.startDate);
      paramIndex++;
    }

    if (query.endDate) {
      conditions.push(`COALESCE(pb.completed_at, pb.started_at, pb.created_at) <= $${paramIndex}`);
      values.push(query.endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM production_batches pb
      ${whereClause};
    `;
    const countRes = await pool.query<{ total: string }>(countQuery, values);
    const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

    const dataQuery = `
      SELECT
        pb.id, pb.batch_number, pb.product_id, pb.production_line_id, pb.shift_id, pb.machine_id, pb.created_by,
        pb.status, pb.planned_quantity, pb.produced_quantity, pb.accepted_quantity, pb.scrap_quantity, pb.rework_pending_quantity,
        pb.started_at, pb.completed_at, pb.created_at, pb.updated_at,
        p.code AS product_code, p.name AS product_name,
        pl.code AS production_line_code, pl.name AS production_line_name,
        s.code AS shift_code, s.name AS shift_name,
        m.code AS machine_code, m.name AS machine_name,
        u.full_name AS created_by_name
      FROM production_batches pb
      JOIN products p ON p.id = pb.product_id
      JOIN production_lines pl ON pl.id = pb.production_line_id
      JOIN shifts s ON s.id = pb.shift_id
      LEFT JOIN machines m ON m.id = pb.machine_id
      LEFT JOIN users u ON u.id = pb.created_by
      ${whereClause}
      ORDER BY pb.created_at DESC, pb.batch_number ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    const dataRes = await pool.query<ProductionBatchDbRow>(dataQuery, [
      ...values,
      query.limit,
      offset,
    ]);

    return {
      items: dataRes.rows.map(toProductionBatchDto),
      total,
    };
  }

  public async findById(id: string, client?: PoolClient): Promise<ProductionBatchDbRow | null> {
    const queryText = `
      SELECT
        pb.id, pb.batch_number, pb.product_id, pb.production_line_id, pb.shift_id, pb.machine_id, pb.created_by,
        pb.status, pb.planned_quantity, pb.produced_quantity, pb.accepted_quantity, pb.scrap_quantity, pb.rework_pending_quantity,
        pb.started_at, pb.completed_at, pb.created_at, pb.updated_at,
        p.code AS product_code, p.name AS product_name,
        pl.code AS production_line_code, pl.name AS production_line_name,
        s.code AS shift_code, s.name AS shift_name,
        m.code AS machine_code, m.name AS machine_name,
        u.full_name AS created_by_name
      FROM production_batches pb
      JOIN products p ON p.id = pb.product_id
      JOIN production_lines pl ON pl.id = pb.production_line_id
      JOIN shifts s ON s.id = pb.shift_id
      LEFT JOIN machines m ON m.id = pb.machine_id
      LEFT JOIN users u ON u.id = pb.created_by
      WHERE pb.id = $1;
    `;
    const res = client
      ? await client.query<ProductionBatchDbRow>(queryText, [id])
      : await pool.query<ProductionBatchDbRow>(queryText, [id]);
    return res.rows[0] ?? null;
  }

  public async findByBatchNumber(
    batchNumber: string,
    client?: PoolClient,
  ): Promise<ProductionBatchDbRow | null> {
    const queryText = `
      SELECT
        pb.id, pb.batch_number, pb.product_id, pb.production_line_id, pb.shift_id, pb.machine_id, pb.created_by,
        pb.status, pb.planned_quantity, pb.produced_quantity, pb.accepted_quantity, pb.scrap_quantity, pb.rework_pending_quantity,
        pb.started_at, pb.completed_at, pb.created_at, pb.updated_at,
        p.code AS product_code, p.name AS product_name,
        pl.code AS production_line_code, pl.name AS production_line_name,
        s.code AS shift_code, s.name AS shift_name,
        m.code AS machine_code, m.name AS machine_name,
        u.full_name AS created_by_name
      FROM production_batches pb
      JOIN products p ON p.id = pb.product_id
      JOIN production_lines pl ON pl.id = pb.production_line_id
      JOIN shifts s ON s.id = pb.shift_id
      LEFT JOIN machines m ON m.id = pb.machine_id
      LEFT JOIN users u ON u.id = pb.created_by
      WHERE pb.batch_number = $1;
    `;
    const res = client
      ? await client.query<ProductionBatchDbRow>(queryText, [batchNumber])
      : await pool.query<ProductionBatchDbRow>(queryText, [batchNumber]);
    return res.rows[0] ?? null;
  }

  public async create(
    data: {
      batchNumber: string;
      productId: string;
      productionLineId: string;
      shiftId: string;
      machineId?: string | null | undefined;
      createdBy?: string | null | undefined;
      plannedQuantity: number;
      status: BatchStatus;
      startedAt?: string | null | undefined;
    },
    client?: PoolClient,
  ): Promise<ProductionBatchDbRow> {
    const queryText = `
      INSERT INTO production_batches (
        batch_number, product_id, production_line_id, shift_id, machine_id, created_by,
        status, planned_quantity, started_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, batch_number, product_id, production_line_id, shift_id, machine_id, created_by,
        status, planned_quantity, produced_quantity, accepted_quantity, scrap_quantity, rework_pending_quantity,
        started_at, completed_at, created_at, updated_at;
    `;
    const values = [
      data.batchNumber,
      data.productId,
      data.productionLineId,
      data.shiftId,
      data.machineId ?? null,
      data.createdBy ?? null,
      data.status,
      data.plannedQuantity,
      data.startedAt ? new Date(data.startedAt) : null,
    ];

    const res = client
      ? await client.query<ProductionBatchDbRow>(queryText, values)
      : await pool.query<ProductionBatchDbRow>(queryText, values);

    const batch = res.rows[0];
    if (!batch) {
      throw new Error('Failed to create production batch');
    }

    // Re-fetch with joined relations
    return (await this.findById(batch.id, client)) ?? batch;
  }

  public async update(
    id: string,
    updates: {
      machineId?: string | null | undefined;
      producedQuantity?: number | undefined;
      acceptedQuantity?: number | undefined;
      scrapQuantity?: number | undefined;
      reworkPendingQuantity?: number | undefined;
      status?: BatchStatus | undefined;
      startedAt?: string | null | undefined;
      completedAt?: string | null | undefined;
    },
    client?: PoolClient,
  ): Promise<ProductionBatchDbRow> {
    const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [id];
    let paramIndex = 2;

    if (updates.machineId !== undefined) {
      setClauses.push(`machine_id = $${paramIndex}`);
      values.push(updates.machineId);
      paramIndex++;
    }
    if (updates.producedQuantity !== undefined) {
      setClauses.push(`produced_quantity = $${paramIndex}`);
      values.push(updates.producedQuantity);
      paramIndex++;
    }
    if (updates.acceptedQuantity !== undefined) {
      setClauses.push(`accepted_quantity = $${paramIndex}`);
      values.push(updates.acceptedQuantity);
      paramIndex++;
    }
    if (updates.scrapQuantity !== undefined) {
      setClauses.push(`scrap_quantity = $${paramIndex}`);
      values.push(updates.scrapQuantity);
      paramIndex++;
    }
    if (updates.reworkPendingQuantity !== undefined) {
      setClauses.push(`rework_pending_quantity = $${paramIndex}`);
      values.push(updates.reworkPendingQuantity);
      paramIndex++;
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex}`);
      values.push(updates.status);
      paramIndex++;
    }
    if (updates.startedAt !== undefined) {
      setClauses.push(`started_at = $${paramIndex}`);
      values.push(updates.startedAt ? new Date(updates.startedAt) : null);
      paramIndex++;
    }
    if (updates.completedAt !== undefined) {
      setClauses.push(`completed_at = $${paramIndex}`);
      values.push(updates.completedAt ? new Date(updates.completedAt) : null);
      paramIndex++;
    }

    const queryText = `
      UPDATE production_batches
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING id, batch_number, product_id, production_line_id, shift_id, machine_id, created_by,
        status, planned_quantity, produced_quantity, accepted_quantity, scrap_quantity, rework_pending_quantity,
        started_at, completed_at, created_at, updated_at;
    `;

    const res = client
      ? await client.query<ProductionBatchDbRow>(queryText, values)
      : await pool.query<ProductionBatchDbRow>(queryText, values);

    const batch = res.rows[0];
    if (!batch) {
      throw new Error(`Production batch not found: ${id}`);
    }

    return (await this.findById(batch.id, client)) ?? batch;
  }
}

export const batchesRepository = new BatchesRepository();
