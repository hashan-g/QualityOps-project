import { pool } from '../../infrastructure/database/pool.js';
import type { CanonicalRole } from '@qualityops/contracts';

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  full_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  roles: CanonicalRole[];
}

export interface RefreshSessionRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  last_used_at: Date | null;
  user_agent: string | null;
  ip_address: string | null;
}

export class AuthRepository {
  /**
   * Fetches an active or inactive user by username or email, aggregating their assigned roles.
   */
  public async findByUsernameOrEmail(identifier: string): Promise<UserRecord | null> {
    const query = `
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
      WHERE u.username = $1 OR u.email = $1
      GROUP BY u.id
      LIMIT 1;
    `;

    const result = await pool.query<{
      id: string;
      username: string;
      email: string;
      password_hash: string;
      full_name: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      roles: CanonicalRole[];
    }>(query, [identifier]);

    return result.rows[0] ?? null;
  }

  /**
   * Fetches a user by ID with aggregated roles.
   */
  public async findById(id: string): Promise<UserRecord | null> {
    const query = `
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
      WHERE u.id = $1
      GROUP BY u.id
      LIMIT 1;
    `;

    const result = await pool.query<{
      id: string;
      username: string;
      email: string;
      password_hash: string;
      full_name: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      roles: CanonicalRole[];
    }>(query, [id]);

    return result.rows[0] ?? null;
  }

  /**
   * Persists a hashed refresh token session.
   */
  public async createRefreshSession(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | undefined;
    ipAddress?: string | undefined;
  }): Promise<RefreshSessionRecord> {
    const query = `
      INSERT INTO refresh_sessions (
        user_id, token_hash, expires_at, user_agent, ip_address
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const result = await pool.query<RefreshSessionRecord>(query, [
      params.userId,
      params.tokenHash,
      params.expiresAt,
      params.userAgent ?? null,
      params.ipAddress ?? null,
    ]);

    const session = result.rows[0];
    if (!session) {
      throw new Error('Failed to create refresh session');
    }
    return session;
  }

  /**
   * Retrieves a refresh session by its SHA-256 token hash.
   */
  public async findRefreshSessionByHash(tokenHash: string): Promise<RefreshSessionRecord | null> {
    const query = `
      SELECT *
      FROM refresh_sessions
      WHERE token_hash = $1
      LIMIT 1;
    `;

    const result = await pool.query<RefreshSessionRecord>(query, [tokenHash]);
    return result.rows[0] ?? null;
  }

  /**
   * Marks a specific refresh session as revoked.
   */
  public async revokeRefreshSession(sessionId: string): Promise<void> {
    const query = `
      UPDATE refresh_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND revoked_at IS NULL;
    `;

    await pool.query(query, [sessionId]);
  }

  /**
   * Revokes a session identified by its token hash.
   */
  public async revokeRefreshSessionByHash(tokenHash: string): Promise<void> {
    const query = `
      UPDATE refresh_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE token_hash = $1 AND revoked_at IS NULL;
    `;

    await pool.query(query, [tokenHash]);
  }

  /**
   * Revokes all active refresh sessions for a user (used during suspicious token reuse or security reset).
   */
  public async revokeAllUserSessions(userId: string): Promise<void> {
    const query = `
      UPDATE refresh_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND revoked_at IS NULL;
    `;

    await pool.query(query, [userId]);
  }
}

export const authRepository = new AuthRepository();
