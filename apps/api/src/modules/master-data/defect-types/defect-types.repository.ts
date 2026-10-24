import type { PoolClient } from 'pg';
import { pool } from '../../../infrastructure/database/pool.js';
import type { DefectSeverity, DefectType, DefectTypeListQuery } from '@qualityops/contracts';

export interface DefectTypeDbRow {
  id: string;
  code: string;
  name: string;
  category: string;
  severity: DefectSeverity;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export function toDefectTypeDto(row: DefectTypeDbRow): DefectType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    severity: row.severity,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class DefectTypesRepository {
  public async list(query: DefectTypeListQuery): Promise<{ items: DefectType[]; total: number }> {
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

    if (query.category) {
      conditions.push(`category ILIKE $${paramIndex}`);
      values.push(`%${query.category}%`);
      paramIndex++;
    }

    if (query.severity) {
      conditions.push(`severity = $${paramIndex}`);
      values.push(query.severity);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) AS total FROM defect_types ${whereClause};`;
    const countRes = await pool.query<{ total: string }>(countQuery, values);
    const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

    const dataQuery = `
      SELECT id, code, name, category, severity, is_active, created_at, updated_at
      FROM defect_types
      ${whereClause}
      ORDER BY code ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    const dataRes = await pool.query<DefectTypeDbRow>(dataQuery, [...values, query.limit, offset]);
    return {
      items: dataRes.rows.map(toDefectTypeDto),
      total,
    };
  }

  public async findById(id: string, client?: PoolClient): Promise<DefectTypeDbRow | null> {
    const queryText = `
      SELECT id, code, name, category, severity, is_active, created_at, updated_at
      FROM defect_types
      WHERE id = $1;
    `;
    const res = client
      ? await client.query<DefectTypeDbRow>(queryText, [id])
      : await pool.query<DefectTypeDbRow>(queryText, [id]);
    return res.rows[0] ?? null;
  }

  public async findByCode(code: string, client?: PoolClient): Promise<DefectTypeDbRow | null> {
    const queryText = `
      SELECT id, code, name, category, severity, is_active, created_at, updated_at
      FROM defect_types
      WHERE code = $1;
    `;
    const res = client
      ? await client.query<DefectTypeDbRow>(queryText, [code])
      : await pool.query<DefectTypeDbRow>(queryText, [code]);
    return res.rows[0] ?? null;
  }

  public async create(
    data: {
      code: string;
      name: string;
      category: string;
      severity: DefectSeverity;
      isActive: boolean;
    },
    client?: PoolClient,
  ): Promise<DefectTypeDbRow> {
    const queryText = `
      INSERT INTO defect_types (code, name, category, severity, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, code, name, category, severity, is_active, created_at, updated_at;
    `;
    const values = [data.code, data.name, data.category, data.severity, data.isActive];
    const res = client
      ? await client.query<DefectTypeDbRow>(queryText, values)
      : await pool.query<DefectTypeDbRow>(queryText, values);

    const defectType = res.rows[0];
    if (!defectType) {
      throw new Error('Failed to create defect type');
    }
    return defectType;
  }

  public async update(
    id: string,
    updates: {
      code?: string | undefined;
      name?: string | undefined;
      category?: string | undefined;
      severity?: DefectSeverity | undefined;
      isActive?: boolean | undefined;
    },
    client?: PoolClient,
  ): Promise<DefectTypeDbRow> {
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
    if (updates.category !== undefined) {
      setClauses.push(`category = $${paramIndex}`);
      values.push(updates.category);
      paramIndex++;
    }
    if (updates.severity !== undefined) {
      setClauses.push(`severity = $${paramIndex}`);
      values.push(updates.severity);
      paramIndex++;
    }
    if (updates.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex}`);
      values.push(updates.isActive);
      paramIndex++;
    }

    const queryText = `
      UPDATE defect_types
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING id, code, name, category, severity, is_active, created_at, updated_at;
    `;

    const res = client
      ? await client.query<DefectTypeDbRow>(queryText, values)
      : await pool.query<DefectTypeDbRow>(queryText, values);

    const defectType = res.rows[0];
    if (!defectType) {
      throw new Error(`Defect type not found: ${id}`);
    }
    return defectType;
  }

  public async delete(id: string, client?: PoolClient): Promise<void> {
    const queryText = 'DELETE FROM defect_types WHERE id = $1;';
    if (client) {
      await client.query(queryText, [id]);
    } else {
      await pool.query(queryText, [id]);
    }
  }
}

export const defectTypesRepository = new DefectTypesRepository();
