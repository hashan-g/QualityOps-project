import type { PoolClient } from 'pg';
import { pool } from '../../../infrastructure/database/pool.js';
import type { Product, ProductListQuery } from '@qualityops/contracts';

export interface ProductDbRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  target_cycle_time_seconds: string | number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export function toProductDto(row: ProductDbRow): Product {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    targetCycleTimeSeconds:
      row.target_cycle_time_seconds !== null ? Number(row.target_cycle_time_seconds) : null,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class ProductsRepository {
  public async list(query: ProductListQuery): Promise<{ items: Product[]; total: number }> {
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

    const countQuery = `SELECT COUNT(*) AS total FROM products ${whereClause};`;
    const countRes = await pool.query<{ total: string }>(countQuery, values);
    const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

    const dataQuery = `
      SELECT id, code, name, description, target_cycle_time_seconds, is_active, created_at, updated_at
      FROM products
      ${whereClause}
      ORDER BY code ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    const dataRes = await pool.query<ProductDbRow>(dataQuery, [...values, query.limit, offset]);
    return {
      items: dataRes.rows.map(toProductDto),
      total,
    };
  }

  public async findById(id: string, client?: PoolClient): Promise<ProductDbRow | null> {
    const queryText = `
      SELECT id, code, name, description, target_cycle_time_seconds, is_active, created_at, updated_at
      FROM products
      WHERE id = $1;
    `;
    const res = client
      ? await client.query<ProductDbRow>(queryText, [id])
      : await pool.query<ProductDbRow>(queryText, [id]);
    return res.rows[0] ?? null;
  }

  public async findByCode(code: string, client?: PoolClient): Promise<ProductDbRow | null> {
    const queryText = `
      SELECT id, code, name, description, target_cycle_time_seconds, is_active, created_at, updated_at
      FROM products
      WHERE code = $1;
    `;
    const res = client
      ? await client.query<ProductDbRow>(queryText, [code])
      : await pool.query<ProductDbRow>(queryText, [code]);
    return res.rows[0] ?? null;
  }

  public async create(
    data: {
      code: string;
      name: string;
      description?: string | null | undefined;
      targetCycleTimeSeconds?: number | null | undefined;
      isActive: boolean;
    },
    client?: PoolClient,
  ): Promise<ProductDbRow> {
    const queryText = `
      INSERT INTO products (code, name, description, target_cycle_time_seconds, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, code, name, description, target_cycle_time_seconds, is_active, created_at, updated_at;
    `;
    const values = [
      data.code,
      data.name,
      data.description ?? null,
      data.targetCycleTimeSeconds ?? null,
      data.isActive,
    ];
    const res = client
      ? await client.query<ProductDbRow>(queryText, values)
      : await pool.query<ProductDbRow>(queryText, values);

    const product = res.rows[0];
    if (!product) {
      throw new Error('Failed to create product');
    }
    return product;
  }

  public async update(
    id: string,
    updates: {
      code?: string | undefined;
      name?: string | undefined;
      description?: string | null | undefined;
      targetCycleTimeSeconds?: number | null | undefined;
      isActive?: boolean | undefined;
    },
    client?: PoolClient,
  ): Promise<ProductDbRow> {
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
    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex}`);
      values.push(updates.description);
      paramIndex++;
    }
    if (updates.targetCycleTimeSeconds !== undefined) {
      setClauses.push(`target_cycle_time_seconds = $${paramIndex}`);
      values.push(updates.targetCycleTimeSeconds);
      paramIndex++;
    }
    if (updates.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex}`);
      values.push(updates.isActive);
      paramIndex++;
    }

    const queryText = `
      UPDATE products
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING id, code, name, description, target_cycle_time_seconds, is_active, created_at, updated_at;
    `;

    const res = client
      ? await client.query<ProductDbRow>(queryText, values)
      : await pool.query<ProductDbRow>(queryText, values);

    const product = res.rows[0];
    if (!product) {
      throw new Error(`Product not found: ${id}`);
    }
    return product;
  }

  public async delete(id: string, client?: PoolClient): Promise<void> {
    const queryText = 'DELETE FROM products WHERE id = $1;';
    if (client) {
      await client.query(queryText, [id]);
    } else {
      await pool.query(queryText, [id]);
    }
  }
}

export const productsRepository = new ProductsRepository();
