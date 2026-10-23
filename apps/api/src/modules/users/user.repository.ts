import { pool } from '../../infrastructure/database/pool.js';
import type { UserRecord } from '../auth/auth.repository.js';
import type { CanonicalRole } from '@qualityops/contracts';

export interface UserListFilter {
  page: number;
  limit: number;
  search?: string | undefined;
  role?: CanonicalRole | undefined;
  isActive?: boolean | undefined;
}

export class UserRepository {
  /**
   * Lists users with pagination and filtering.
   */
  public async listUsers(filter: UserListFilter): Promise<{ users: UserRecord[]; total: number }> {
    const offset = (filter.page - 1) * filter.limit;
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.search) {
      conditions.push(
        `(u.username ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex})`,
      );
      values.push(`%${filter.search}%`);
      paramIndex++;
    }

    if (filter.isActive !== undefined) {
      conditions.push(`u.is_active = $${paramIndex}`);
      values.push(filter.isActive);
      paramIndex++;
    }

    if (filter.role) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM user_roles ur_filter
          JOIN roles r_filter ON ur_filter.role_id = r_filter.id
          WHERE ur_filter.user_id = u.id AND r_filter.name = $${paramIndex}
        )`,
      );
      values.push(filter.role);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count query
    const countQuery = `SELECT COUNT(*) AS total FROM users u ${whereClause};`;
    const countResult = await pool.query<{ total: string }>(countQuery, values);
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // Data query with roles aggregation
    const dataQuery = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.password_hash,
        u.full_name,
        u.is_active,
        u.created_at,
        u.updated_at,
        COALESCE(
          json_agg(r.name) FILTER (WHERE r.name IS NOT NULL),
          '[]'::json
        ) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    const dataResult = await pool.query<UserRecord>(dataQuery, [...values, filter.limit, offset]);

    return {
      users: dataResult.rows,
      total,
    };
  }

  /**
   * Retrieves all canonical role records from the database.
   */
  public async getAvailableRoles(): Promise<{ id: string; name: string }[]> {
    const result = await pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM roles ORDER BY name ASC;',
    );
    return result.rows;
  }

  /**
   * Creates a user and assigns initial roles within a transaction.
   */
  public async createUser(params: {
    username: string;
    email: string;
    passwordHash: string;
    fullName: string;
    isActive: boolean;
    roles: CanonicalRole[];
  }): Promise<UserRecord> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      const insertUserSql = `
        INSERT INTO users (username, email, password_hash, full_name, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, username, email, password_hash, full_name, is_active, created_at, updated_at;
      `;

      const userRes = await client.query<{
        id: string;
        username: string;
        email: string;
        password_hash: string;
        full_name: string;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      }>(insertUserSql, [
        params.username,
        params.email,
        params.passwordHash,
        params.fullName,
        params.isActive,
      ]);

      const user = userRes.rows[0];
      if (!user) {
        throw new Error('Failed to create user record');
      }

      // Assign roles
      for (const roleName of params.roles) {
        await client.query(
          `
          INSERT INTO user_roles (user_id, role_id)
          SELECT $1, id FROM roles WHERE name = $2;
        `,
          [user.id, roleName],
        );
      }

      await client.query('COMMIT;');

      return {
        ...user,
        roles: params.roles,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Updates allowed profile attributes or password hash.
   */
  public async updateUser(
    id: string,
    updates: {
      email?: string | undefined;
      fullName?: string | undefined;
      isActive?: boolean | undefined;
      passwordHash?: string | undefined;
    },
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [id];
    let paramIndex = 2;

    if (updates.email !== undefined) {
      setClauses.push(`email = $${paramIndex}`);
      values.push(updates.email);
      paramIndex++;
    }

    if (updates.fullName !== undefined) {
      setClauses.push(`full_name = $${paramIndex}`);
      values.push(updates.fullName);
      paramIndex++;
    }

    if (updates.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex}`);
      values.push(updates.isActive);
      paramIndex++;
    }

    if (updates.passwordHash !== undefined) {
      setClauses.push(`password_hash = $${paramIndex}`);
      values.push(updates.passwordHash);
      paramIndex++;
    }

    const query = `
      UPDATE users
      SET ${setClauses.join(', ')}
      WHERE id = $1;
    `;

    await pool.query(query, values);
  }

  /**
   * Replaces assigned roles for a user.
   */
  public async assignRoles(userId: string, roleNames: CanonicalRole[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      // Remove existing roles
      await client.query('DELETE FROM user_roles WHERE user_id = $1;', [userId]);

      // Assign new roles
      for (const role of roleNames) {
        await client.query(
          `
          INSERT INTO user_roles (user_id, role_id)
          SELECT $1, id FROM roles WHERE name = $2;
        `,
          [userId, role],
        );
      }

      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const userRepository = new UserRepository();
