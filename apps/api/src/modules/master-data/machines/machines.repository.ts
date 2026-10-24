import type { PoolClient } from 'pg';
import { pool } from '../../../infrastructure/database/pool.js';
import type { Machine, MachineListQuery, MachineStatus } from '@qualityops/contracts';

export interface MachineDbRow {
  id: string;
  code: string;
  name: string;
  production_line_id: string;
  production_line_name?: string | null;
  status: MachineStatus;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export function toMachineDto(row: MachineDbRow): Machine {
  const result: Machine = {
    id: row.id,
    code: row.code,
    name: row.name,
    productionLineId: row.production_line_id,
    status: row.status,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };

  if (row.production_line_name) {
    result.productionLineName = row.production_line_name;
  }

  return result;
}

export class MachinesRepository {
  public async list(query: MachineListQuery): Promise<{ items: Machine[]; total: number }> {
    const offset = (query.page - 1) * query.limit;
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (query.search) {
      conditions.push(`(m.code ILIKE $${paramIndex} OR m.name ILIKE $${paramIndex})`);
      values.push(`%${query.search}%`);
      paramIndex++;
    }

    if (query.isActive !== undefined) {
      conditions.push(`m.is_active = $${paramIndex}`);
      values.push(query.isActive);
      paramIndex++;
    }

    if (query.productionLineId) {
      conditions.push(`m.production_line_id = $${paramIndex}`);
      values.push(query.productionLineId);
      paramIndex++;
    }

    if (query.status) {
      conditions.push(`m.status = $${paramIndex}`);
      values.push(query.status);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) AS total FROM machines m ${whereClause};`;
    const countRes = await pool.query<{ total: string }>(countQuery, values);
    const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

    const dataQuery = `
      SELECT m.id, m.code, m.name, m.production_line_id, pl.name AS production_line_name,
             m.status, m.is_active, m.created_at, m.updated_at
      FROM machines m
      LEFT JOIN production_lines pl ON pl.id = m.production_line_id
      ${whereClause}
      ORDER BY m.code ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    const dataRes = await pool.query<MachineDbRow>(dataQuery, [...values, query.limit, offset]);
    return {
      items: dataRes.rows.map(toMachineDto),
      total,
    };
  }

  public async findById(id: string, client?: PoolClient): Promise<MachineDbRow | null> {
    const queryText = `
      SELECT m.id, m.code, m.name, m.production_line_id, pl.name AS production_line_name,
             m.status, m.is_active, m.created_at, m.updated_at
      FROM machines m
      LEFT JOIN production_lines pl ON pl.id = m.production_line_id
      WHERE m.id = $1;
    `;
    const res = client
      ? await client.query<MachineDbRow>(queryText, [id])
      : await pool.query<MachineDbRow>(queryText, [id]);
    return res.rows[0] ?? null;
  }

  public async findByCode(code: string, client?: PoolClient): Promise<MachineDbRow | null> {
    const queryText = `
      SELECT m.id, m.code, m.name, m.production_line_id, pl.name AS production_line_name,
             m.status, m.is_active, m.created_at, m.updated_at
      FROM machines m
      LEFT JOIN production_lines pl ON pl.id = m.production_line_id
      WHERE m.code = $1;
    `;
    const res = client
      ? await client.query<MachineDbRow>(queryText, [code])
      : await pool.query<MachineDbRow>(queryText, [code]);
    return res.rows[0] ?? null;
  }

  public async create(
    data: {
      code: string;
      name: string;
      productionLineId: string;
      status: MachineStatus;
      isActive: boolean;
    },
    client?: PoolClient,
  ): Promise<MachineDbRow> {
    const queryText = `
      INSERT INTO machines (code, name, production_line_id, status, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, code, name, production_line_id, status, is_active, created_at, updated_at;
    `;
    const values = [data.code, data.name, data.productionLineId, data.status, data.isActive];
    const res = client
      ? await client.query<MachineDbRow>(queryText, values)
      : await pool.query<MachineDbRow>(queryText, values);

    const machine = res.rows[0];
    if (!machine) {
      throw new Error('Failed to create machine');
    }
    return machine;
  }

  public async update(
    id: string,
    updates: {
      code?: string | undefined;
      name?: string | undefined;
      productionLineId?: string | undefined;
      status?: MachineStatus | undefined;
      isActive?: boolean | undefined;
    },
    client?: PoolClient,
  ): Promise<MachineDbRow> {
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
    if (updates.productionLineId !== undefined) {
      setClauses.push(`production_line_id = $${paramIndex}`);
      values.push(updates.productionLineId);
      paramIndex++;
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex}`);
      values.push(updates.status);
      paramIndex++;
    }
    if (updates.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex}`);
      values.push(updates.isActive);
      paramIndex++;
    }

    const queryText = `
      UPDATE machines
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING id, code, name, production_line_id, status, is_active, created_at, updated_at;
    `;

    const res = client
      ? await client.query<MachineDbRow>(queryText, values)
      : await pool.query<MachineDbRow>(queryText, values);

    const machine = res.rows[0];
    if (!machine) {
      throw new Error(`Machine not found: ${id}`);
    }
    return machine;
  }

  public async delete(id: string, client?: PoolClient): Promise<void> {
    const queryText = 'DELETE FROM machines WHERE id = $1;';
    if (client) {
      await client.query(queryText, [id]);
    } else {
      await pool.query(queryText, [id]);
    }
  }
}

export const machinesRepository = new MachinesRepository();
