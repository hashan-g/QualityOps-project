import type { PoolClient } from 'pg';
import { pool } from '../../../infrastructure/database/pool.js';
import type { ProductionLine, ProductionLineListQuery } from '@qualityops/contracts';

export interface ProductionLineDbRow {
  id: string;
  code: string;
  name: string;
  location: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export function toProductionLineDto(row: ProductionLineDbRow): ProductionLine {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    location: row.location,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class ProductionLinesRepository {
  public async list(
    query: ProductionLineListQuery,
  ): Promise<{ items: ProductionLine[]; total: number }> {
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

    const countQuery = `SELECT COUNT(*) AS total FROM production_lines ${whereClause};`;
    const countRes = await pool.query<{ total: string }>(countQuery, values);
    const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

    const dataQuery = `
      SELECT id, code, name, location, is_active, created_at, updated_at
      FROM production_lines
      ${whereClause}
      ORDER BY code ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    const dataRes = await pool.query<ProductionLineDbRow>(dataQuery, [
      ...values,
      query.limit,
      offset,
    ]);
    return {
      items: dataRes.rows.map(toProductionLineDto),
      total,
    };
  }

  public async findById(id: string, client?: PoolClient): Promise<ProductionLineDbRow | null> {
    const queryText = `
      SELECT id, code, name, location, is_active, created_at, updated_at
      FROM production_lines
      WHERE id = $1;
    `;
    const res = client
      ? await client.query<ProductionLineDbRow>(queryText, [id])
      : await pool.query<ProductionLineDbRow>(queryText, [id]);
    return res.rows[0] ?? null;
  }

  public async findByCode(code: string, client?: PoolClient): Promise<ProductionLineDbRow | null> {
    const queryText = `
      SELECT id, code, name, location, is_active, created_at, updated_at
      FROM production_lines
      WHERE code = $1;
    `;
    const res = client
      ? await client.query<ProductionLineDbRow>(queryText, [code])
      : await pool.query<ProductionLineDbRow>(queryText, [code]);
    return res.rows[0] ?? null;
  }

  public async create(
    data: {
      code: string;
      name: string;
      location?: string | null | undefined;
      isActive: boolean;
    },
    client?: PoolClient,
  ): Promise<ProductionLineDbRow> {
    const queryText = `
      INSERT INTO production_lines (code, name, location, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id, code, name, location, is_active, created_at, updated_at;
    `;
    const values = [data.code, data.name, data.location ?? null, data.isActive];
    const res = client
      ? await client.query<ProductionLineDbRow>(queryText, values)
      : await pool.query<ProductionLineDbRow>(queryText, values);

    const line = res.rows[0];
    if (!line) {
      throw new Error('Failed to create production line');
    }
    return line;
  }

  public async update(
    id: string,
    updates: {
      code?: string | undefined;
      name?: string | undefined;
      location?: string | null | undefined;
      isActive?: boolean | undefined;
    },
    client?: PoolClient,
  ): Promise<ProductionLineDbRow> {
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
    if (updates.location !== undefined) {
      setClauses.push(`location = $${paramIndex}`);
      values.push(updates.location);
      paramIndex++;
    }
    if (updates.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex}`);
      values.push(updates.isActive);
      paramIndex++;
    }

    const queryText = `
      UPDATE production_lines
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING id, code, name, location, is_active, created_at, updated_at;
    `;

    const res = client
      ? await client.query<ProductionLineDbRow>(queryText, values)
      : await pool.query<ProductionLineDbRow>(queryText, values);

    const line = res.rows[0];
    if (!line) {
      throw new Error(`Production line not found: ${id}`);
    }
    return line;
  }

  public async delete(id: string, client?: PoolClient): Promise<void> {
    const queryText = 'DELETE FROM production_lines WHERE id = $1;';
    if (client) {
      await client.query(queryText, [id]);
    } else {
      await pool.query(queryText, [id]);
    }
  }
}

export const productionLinesRepository = new ProductionLinesRepository();
