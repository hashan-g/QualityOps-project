import type { PoolClient } from 'pg';
import { pool } from '../../../infrastructure/database/pool.js';
import type { Shift, ShiftListQuery } from '@qualityops/contracts';

export interface ShiftDbRow {
  id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export function toShiftDto(row: ShiftDbRow): Shift {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    startTime:
      typeof row.start_time === 'string' ? row.start_time.slice(0, 5) : String(row.start_time),
    endTime: typeof row.end_time === 'string' ? row.end_time.slice(0, 5) : String(row.end_time),
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class ShiftsRepository {
  public async list(query: ShiftListQuery): Promise<{ items: Shift[]; total: number }> {
    const offset = (query.page - 1) * query.limit;
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (query.search) {
      conditions.push(`(code ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`);
      values.push(`%${query.search}%`);
      paramIndex++;
    }

    if (query.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex}`);
      values.push(query.isActive);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) AS total FROM shifts ${whereClause};`;
    const countRes = await pool.query<{ total: string }>(countQuery, values);
    const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

    const dataQuery = `
      SELECT id, code, name, start_time::text, end_time::text, is_active, created_at, updated_at
      FROM shifts
      ${whereClause}
      ORDER BY start_time ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    const dataRes = await pool.query<ShiftDbRow>(dataQuery, [...values, query.limit, offset]);
    return {
      items: dataRes.rows.map(toShiftDto),
      total,
    };
  }

  public async findById(id: string, client?: PoolClient): Promise<ShiftDbRow | null> {
    const queryText = `
      SELECT id, code, name, start_time::text, end_time::text, is_active, created_at, updated_at
      FROM shifts
      WHERE id = $1;
    `;
    const res = client
      ? await client.query<ShiftDbRow>(queryText, [id])
      : await pool.query<ShiftDbRow>(queryText, [id]);
    return res.rows[0] ?? null;
  }

  public async findByCode(code: string, client?: PoolClient): Promise<ShiftDbRow | null> {
    const queryText = `
      SELECT id, code, name, start_time::text, end_time::text, is_active, created_at, updated_at
      FROM shifts
      WHERE code = $1;
    `;
    const res = client
      ? await client.query<ShiftDbRow>(queryText, [code])
      : await pool.query<ShiftDbRow>(queryText, [code]);
    return res.rows[0] ?? null;
  }

  public async create(
    data: {
      code: string;
      name: string;
      startTime: string;
      endTime: string;
      isActive: boolean;
    },
    client?: PoolClient,
  ): Promise<ShiftDbRow> {
    const queryText = `
      INSERT INTO shifts (code, name, start_time, end_time, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, code, name, start_time::text, end_time::text, is_active, created_at, updated_at;
    `;
    const values = [data.code, data.name, data.startTime, data.endTime, data.isActive];
    const res = client
      ? await client.query<ShiftDbRow>(queryText, values)
      : await pool.query<ShiftDbRow>(queryText, values);

    const shift = res.rows[0];
    if (!shift) {
      throw new Error('Failed to create shift');
    }
    return shift;
  }

  public async update(
    id: string,
    updates: {
      code?: string | undefined;
      name?: string | undefined;
      startTime?: string | undefined;
      endTime?: string | undefined;
      isActive?: boolean | undefined;
    },
    client?: PoolClient,
  ): Promise<ShiftDbRow> {
    const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [id];
    let paramIndex = 2;

    if (updates.code !== undefined) {
      setClauses.push(`code = $${paramIndex}`);
      values.push(updates.code);
      paramIndex++;
    }
    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex}`);
      values.push(updates.name);
      paramIndex++;
    }
    if (updates.startTime !== undefined) {
      setClauses.push(`start_time = $${paramIndex}`);
      values.push(updates.startTime);
      paramIndex++;
    }
    if (updates.endTime !== undefined) {
      setClauses.push(`end_time = $${paramIndex}`);
      values.push(updates.endTime);
      paramIndex++;
    }
    if (updates.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex}`);
      values.push(updates.isActive);
      paramIndex++;
    }

    const queryText = `
      UPDATE shifts
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING id, code, name, start_time::text, end_time::text, is_active, created_at, updated_at;
    `;

    const res = client
      ? await client.query<ShiftDbRow>(queryText, values)
      : await pool.query<ShiftDbRow>(queryText, values);

    const shift = res.rows[0];
    if (!shift) {
      throw new Error(`Shift not found: ${id}`);
    }
    return shift;
  }

  public async delete(id: string, client?: PoolClient): Promise<void> {
    const queryText = 'DELETE FROM shifts WHERE id = $1;';
    if (client) {
      await client.query(queryText, [id]);
    } else {
      await pool.query(queryText, [id]);
    }
  }
}

export const shiftsRepository = new ShiftsRepository();
