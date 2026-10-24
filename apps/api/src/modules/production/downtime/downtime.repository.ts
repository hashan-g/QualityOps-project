import type { PoolClient } from 'pg';
import { pool } from '../../../infrastructure/database/pool.js';
import type { DowntimeCategory, DowntimeListQuery, DowntimeRecord } from '@qualityops/contracts';

export interface DowntimeDbRow {
  id: string;
  production_line_id: string;
  production_line_code?: string | null | undefined;
  production_line_name?: string | null | undefined;
  machine_id: string | null;
  machine_code?: string | null | undefined;
  machine_name?: string | null | undefined;
  batch_id: string | null;
  batch_number?: string | null | undefined;
  reason: string;
  category: DowntimeCategory;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | string | null;
  recorded_by: string | null;
  recorded_by_name?: string | null | undefined;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export function toDowntimeDto(row: DowntimeDbRow): DowntimeRecord {
  return {
    id: row.id,
    productionLineId: row.production_line_id,
    productionLineCode: row.production_line_code ?? undefined,
    productionLineName: row.production_line_name ?? undefined,
    machineId: row.machine_id,
    machineCode: row.machine_code ?? undefined,
    machineName: row.machine_name ?? undefined,
    batchId: row.batch_id,
    batchNumber: row.batch_number ?? undefined,
    reason: row.reason,
    category: row.category,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    durationSeconds: row.duration_seconds !== null ? Number(row.duration_seconds) : null,
    recordedBy: row.recorded_by,
    recordedByName: row.recorded_by_name ?? undefined,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class DowntimeRepository {
  public async list(query: DowntimeListQuery): Promise<{ items: DowntimeRecord[]; total: number }> {
    const offset = (query.page - 1) * query.limit;
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (query.search) {
      conditions.push(`d.reason ILIKE $${paramIndex}`);
      values.push(`%${query.search}%`);
      paramIndex++;
    }

    if (query.productionLineId) {
      conditions.push(`d.production_line_id = $${paramIndex}`);
      values.push(query.productionLineId);
      paramIndex++;
    }

    if (query.machineId) {
      conditions.push(`d.machine_id = $${paramIndex}`);
      values.push(query.machineId);
      paramIndex++;
    }

    if (query.batchId) {
      conditions.push(`d.batch_id = $${paramIndex}`);
      values.push(query.batchId);
      paramIndex++;
    }

    if (query.category) {
      conditions.push(`d.category = $${paramIndex}`);
      values.push(query.category);
      paramIndex++;
    }

    if (query.startDate) {
      conditions.push(`d.started_at >= $${paramIndex}`);
      values.push(query.startDate);
      paramIndex++;
    }

    if (query.endDate) {
      conditions.push(`d.started_at <= $${paramIndex}`);
      values.push(query.endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM downtime_records d
      ${whereClause};
    `;
    const countRes = await pool.query<{ total: string }>(countQuery, values);
    const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

    const dataQuery = `
      SELECT
        d.id, d.production_line_id, d.machine_id, d.batch_id, d.reason, d.category,
        d.started_at, d.ended_at, d.duration_seconds, d.recorded_by, d.notes,
        d.created_at, d.updated_at,
        pl.code AS production_line_code, pl.name AS production_line_name,
        m.code AS machine_code, m.name AS machine_name,
        pb.batch_number AS batch_number,
        u.full_name AS recorded_by_name
      FROM downtime_records d
      JOIN production_lines pl ON pl.id = d.production_line_id
      LEFT JOIN machines m ON m.id = d.machine_id
      LEFT JOIN production_batches pb ON pb.id = d.batch_id
      LEFT JOIN users u ON u.id = d.recorded_by
      ${whereClause}
      ORDER BY d.started_at DESC, d.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    const dataRes = await pool.query<DowntimeDbRow>(dataQuery, [...values, query.limit, offset]);

    return {
      items: dataRes.rows.map(toDowntimeDto),
      total,
    };
  }

  public async findById(id: string, client?: PoolClient): Promise<DowntimeDbRow | null> {
    const queryText = `
      SELECT
        d.id, d.production_line_id, d.machine_id, d.batch_id, d.reason, d.category,
        d.started_at, d.ended_at, d.duration_seconds, d.recorded_by, d.notes,
        d.created_at, d.updated_at,
        pl.code AS production_line_code, pl.name AS production_line_name,
        m.code AS machine_code, m.name AS machine_name,
        pb.batch_number AS batch_number,
        u.full_name AS recorded_by_name
      FROM downtime_records d
      JOIN production_lines pl ON pl.id = d.production_line_id
      LEFT JOIN machines m ON m.id = d.machine_id
      LEFT JOIN production_batches pb ON pb.id = d.batch_id
      LEFT JOIN users u ON u.id = d.recorded_by
      WHERE d.id = $1;
    `;
    const res = client
      ? await client.query<DowntimeDbRow>(queryText, [id])
      : await pool.query<DowntimeDbRow>(queryText, [id]);
    return res.rows[0] ?? null;
  }

  public async create(
    data: {
      productionLineId: string;
      machineId?: string | null | undefined;
      batchId?: string | null | undefined;
      reason: string;
      category: DowntimeCategory;
      startedAt: string;
      endedAt?: string | null | undefined;
      recordedBy?: string | null | undefined;
      notes?: string | null | undefined;
    },
    client?: PoolClient,
  ): Promise<DowntimeDbRow> {
    // Note: duration_seconds is GENERATED ALWAYS; it must NEVER appear in the INSERT column list
    const queryText = `
      INSERT INTO downtime_records (
        production_line_id, machine_id, batch_id, reason, category,
        started_at, ended_at, recorded_by, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, production_line_id, machine_id, batch_id, reason, category,
        started_at, ended_at, duration_seconds, recorded_by, notes, created_at, updated_at;
    `;
    const values = [
      data.productionLineId,
      data.machineId ?? null,
      data.batchId ?? null,
      data.reason,
      data.category,
      new Date(data.startedAt),
      data.endedAt ? new Date(data.endedAt) : null,
      data.recordedBy ?? null,
      data.notes ?? null,
    ];

    const res = client
      ? await client.query<DowntimeDbRow>(queryText, values)
      : await pool.query<DowntimeDbRow>(queryText, values);

    const downtime = res.rows[0];
    if (!downtime) {
      throw new Error('Failed to create downtime record');
    }

    return (await this.findById(downtime.id, client)) ?? downtime;
  }

  public async update(
    id: string,
    updates: {
      reason?: string | undefined;
      category?: DowntimeCategory | undefined;
      endedAt?: string | null | undefined;
      notes?: string | null | undefined;
    },
    client?: PoolClient,
  ): Promise<DowntimeDbRow> {
    const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [id];
    let paramIndex = 2;

    if (updates.reason !== undefined) {
      setClauses.push(`reason = $${paramIndex}`);
      values.push(updates.reason);
      paramIndex++;
    }
    if (updates.category !== undefined) {
      setClauses.push(`category = $${paramIndex}`);
      values.push(updates.category);
      paramIndex++;
    }
    if (updates.endedAt !== undefined) {
      setClauses.push(`ended_at = $${paramIndex}`);
      values.push(updates.endedAt ? new Date(updates.endedAt) : null);
      paramIndex++;
    }
    if (updates.notes !== undefined) {
      setClauses.push(`notes = $${paramIndex}`);
      values.push(updates.notes);
      paramIndex++;
    }

    const queryText = `
      UPDATE downtime_records
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING id, production_line_id, machine_id, batch_id, reason, category,
        started_at, ended_at, duration_seconds, recorded_by, notes, created_at, updated_at;
    `;

    const res = client
      ? await client.query<DowntimeDbRow>(queryText, values)
      : await pool.query<DowntimeDbRow>(queryText, values);

    const downtime = res.rows[0];
    if (!downtime) {
      throw new Error(`Downtime record not found: ${id}`);
    }

    return (await this.findById(downtime.id, client)) ?? downtime;
  }
}

export const downtimeRepository = new DowntimeRepository();
