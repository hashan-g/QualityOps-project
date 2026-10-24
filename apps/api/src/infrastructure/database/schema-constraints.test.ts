import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { config } from '../../config.js';

interface PostgresDatabaseError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
  table?: string;
  schema?: string;
  routine?: string;
}

let savepointCounter = 0;

async function assertConstraintViolation(
  client: pg.PoolClient,
  action: () => Promise<unknown>,
  expectedConstraint: string,
  expectedCode = '23514',
): Promise<void> {
  savepointCounter += 1;
  const savepointName = `sp_constraint_${savepointCounter}`;

  await client.query(`SAVEPOINT ${savepointName};`);

  let caughtError: unknown = null;
  try {
    await action();
  } catch (err) {
    caughtError = err;
  } finally {
    if (caughtError) {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepointName};`);
    }
    try {
      await client.query(`RELEASE SAVEPOINT ${savepointName};`);
    } catch {
      // Safe to ignore if savepoint was already rolled back or connection closed
    }
  }

  if (!caughtError) {
    throw new Error(
      `Constraint check failed: Expected statement to violate constraint '${expectedConstraint}' (${expectedCode}), but the query succeeded.`,
    );
  }

  const pgError = caughtError as PostgresDatabaseError;

  // 1. Verify SQLSTATE code matches expected error code
  expect(
    pgError.code,
    `Expected SQLSTATE code '${expectedCode}' for constraint '${expectedConstraint}', but received code '${pgError.code}' with message: '${pgError.message}'`,
  ).toBe(expectedCode);

  // 2. Verify constraint name matches
  if (pgError.constraint) {
    expect(
      pgError.constraint,
      `Expected constraint name '${expectedConstraint}', but received '${pgError.constraint}'`,
    ).toBe(expectedConstraint);
  } else {
    expect(
      pgError.message,
      `Expected error message to reference constraint '${expectedConstraint}', but got: '${pgError.message}'`,
    ).toContain(expectedConstraint);
  }
}

describe('Database Schema & Migration Constraints', () => {
  const migration001Path = path.resolve(
    process.cwd(),
    '../../database/migrations/001_initial_schema.sql',
  );
  const migration001Sql = fs.readFileSync(migration001Path, 'utf-8');

  const migration002Path = path.resolve(
    process.cwd(),
    '../../database/migrations/002_auth_sessions.sql',
  );
  const migration002Sql = fs.readFileSync(migration002Path, 'utf-8');

  const migration003Path = path.resolve(
    process.cwd(),
    '../../database/migrations/003_shifts_is_active.sql',
  );
  const migration003Sql = fs.readFileSync(migration003Path, 'utf-8');

  describe('assertConstraintViolation Helper Integrity', () => {
    it('rolls back to savepoint and validates error code and constraint on violation', async () => {
      const executedQueries: string[] = [];
      const mockClient = {
        query: (sql: string) => {
          executedQueries.push(sql);
          return Promise.resolve({ rows: [] });
        },
      } as unknown as pg.PoolClient;

      const mockViolationAction = () => {
        const err = new Error('violates check constraint "chk_test"') as PostgresDatabaseError;
        err.code = '23514';
        err.constraint = 'chk_test';
        return Promise.reject(err);
      };

      await assertConstraintViolation(mockClient, mockViolationAction, 'chk_test');

      expect(executedQueries.some((q) => q.startsWith('SAVEPOINT'))).toBe(true);
      expect(executedQueries.some((q) => q.startsWith('ROLLBACK TO SAVEPOINT'))).toBe(true);
      expect(executedQueries.some((q) => q.startsWith('RELEASE SAVEPOINT'))).toBe(true);
    });

    it('fails explicitly if the statement unexpectedly succeeds', async () => {
      const mockClient = {
        query: () => Promise.resolve({ rows: [] }),
      } as unknown as pg.PoolClient;

      await expect(
        assertConstraintViolation(mockClient, () => Promise.resolve(), 'chk_test'),
      ).rejects.toThrow(/Constraint check failed: Expected statement to violate constraint/);
    });

    it('fails if the error code does not match expected code', async () => {
      const mockClient = {
        query: () => Promise.resolve({ rows: [] }),
      } as unknown as pg.PoolClient;

      const mockWrongErrorAction = () => {
        const err = new Error('syntax error') as PostgresDatabaseError;
        err.code = '42601';
        return Promise.reject(err);
      };

      await expect(
        assertConstraintViolation(mockClient, mockWrongErrorAction, 'chk_test'),
      ).rejects.toThrow(/Expected SQLSTATE code '23514'/);
    });

    it('fails if the constraint name does not match', async () => {
      const mockClient = {
        query: () => Promise.resolve({ rows: [] }),
      } as unknown as pg.PoolClient;

      const mockWrongConstraintAction = () => {
        const err = new Error('violates check constraint "chk_other"') as PostgresDatabaseError;
        err.code = '23514';
        err.constraint = 'chk_other';
        return Promise.reject(err);
      };

      await expect(
        assertConstraintViolation(mockClient, mockWrongConstraintAction, 'chk_test'),
      ).rejects.toThrow(/Expected constraint name 'chk_test'/);
    });
  });

  describe('Static Schema & Constraint Definitions (Phase 2 & 3)', () => {
    it('migration 001 exists and contains Up and Down sections', () => {
      expect(migration001Sql).toContain('-- Up Migration');
      expect(migration001Sql).toContain('-- Down Migration');
    });

    it('migration 002 exists and contains Up and Down sections', () => {
      expect(migration002Sql).toContain('-- Up Migration');
      expect(migration002Sql).toContain('-- Down Migration');
    });

    it('migration 003 exists and contains Up and Down sections', () => {
      expect(migration003Sql).toContain('-- Up Migration');
      expect(migration003Sql).toContain('-- Down Migration');
    });

    it('migration 003 adds is_active to shifts table with index', () => {
      expect(migration003Sql).toContain(
        'ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true',
      );
      expect(migration003Sql).toContain(
        'CREATE INDEX IF NOT EXISTS idx_shifts_is_active ON shifts(is_active)',
      );
    });

    it('defines all canonical database tables across migrations', () => {
      const requiredTables = [
        'users',
        'roles',
        'user_roles',
        'products',
        'production_lines',
        'machines',
        'shifts',
        'defect_types',
        'production_batches',
        'quality_inspections',
        'defect_records',
        'downtime_records',
        'capa_cases',
        'capa_actions',
        'audit_logs',
      ];

      for (const table of requiredTables) {
        expect(migration001Sql).toMatch(
          new RegExp(`CREATE TABLE (IF NOT EXISTS )?${table}\\b`, 'i'),
        );
      }

      expect(migration002Sql).toMatch(/CREATE TABLE (IF NOT EXISTS )?refresh_sessions\b/i);
    });

    it('seeds the 6 canonical roles idempotently in migration 002', () => {
      expect(migration002Sql).toContain('ADMIN');
      expect(migration002Sql).toContain('QUALITY_MANAGER');
      expect(migration002Sql).toContain('SUPERVISOR');
      expect(migration002Sql).toContain('INSPECTOR');
      expect(migration002Sql).toContain('OPERATOR');
      expect(migration002Sql).toContain('VIEWER');
      expect(migration002Sql).toContain('ON CONFLICT (name) DO UPDATE');
    });

    it('enforces session timestamps and constraints in refresh_sessions', () => {
      expect(migration002Sql).toContain('token_hash VARCHAR(64) NOT NULL UNIQUE');
      expect(migration002Sql).toContain(
        'user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE',
      );
      expect(migration002Sql).toContain('expires_at TIMESTAMPTZ NOT NULL');
      expect(migration002Sql).toContain('idx_refresh_sessions_user_id');
      expect(migration002Sql).toContain('idx_refresh_sessions_token_hash');
      expect(migration002Sql).toContain(
        'CONSTRAINT chk_refresh_sessions_revoked_after_created CHECK (revoked_at IS NULL OR revoked_at >= created_at)',
      );
    });

    it('enforces production quantity invariants in production_batches', () => {
      expect(migration001Sql).toContain(
        'produced_quantity INT NOT NULL DEFAULT 0 CHECK (produced_quantity >= 0)',
      );
      expect(migration001Sql).toContain(
        'accepted_quantity INT NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0)',
      );
      expect(migration001Sql).toContain(
        'scrap_quantity INT NOT NULL DEFAULT 0 CHECK (scrap_quantity >= 0)',
      );
      expect(migration001Sql).toContain(
        'rework_pending_quantity INT NOT NULL DEFAULT 0 CHECK (rework_pending_quantity >= 0)',
      );
      expect(migration001Sql).toContain(
        'CONSTRAINT chk_batch_disposition_sum CHECK (accepted_quantity + scrap_quantity + rework_pending_quantity <= produced_quantity)',
      );
      expect(migration001Sql).toContain(
        "CONSTRAINT chk_batch_completed_reconciled CHECK (status <> 'COMPLETED' OR (accepted_quantity + scrap_quantity + rework_pending_quantity = produced_quantity))",
      );
    });

    it('enforces inspection sample invariants in quality_inspections', () => {
      expect(migration001Sql).toContain('sample_size INT NOT NULL CHECK (sample_size > 0)');
      expect(migration001Sql).toContain(
        'passed_units INT NOT NULL DEFAULT 0 CHECK (passed_units >= 0)',
      );
      expect(migration001Sql).toContain(
        'failed_units INT NOT NULL DEFAULT 0 CHECK (failed_units >= 0)',
      );
      expect(migration001Sql).toContain(
        'CONSTRAINT chk_inspection_units_sum CHECK (passed_units + failed_units <= sample_size)',
      );
      expect(migration001Sql).toContain(
        "CONSTRAINT chk_inspection_completed_reconciled CHECK (status <> 'COMPLETED' OR (passed_units + failed_units = sample_size))",
      );
      expect(migration001Sql).toContain(
        'CONSTRAINT uq_inspection_batch_stage_attempt UNIQUE (batch_id, stage, attempt_number)',
      );
    });

    it('enforces defect occurrence and affected-unit distinction in defect_records', () => {
      expect(migration001Sql).toContain(
        'occurrence_count INT NOT NULL CHECK (occurrence_count >= 1)',
      );
      expect(migration001Sql).toContain(
        'affected_unit_count INT NOT NULL CHECK (affected_unit_count >= 1)',
      );
      expect(migration001Sql).toContain(
        'CONSTRAINT chk_defect_affected_le_occurrence CHECK (affected_unit_count <= occurrence_count)',
      );
      expect(migration001Sql).toContain(
        'CONSTRAINT uq_defect_record_inspection_type UNIQUE (inspection_id, defect_type_id)',
      );
    });

    it('enforces CAPA closure verification in capa_cases', () => {
      expect(migration001Sql).toContain(
        "CONSTRAINT chk_capa_closed_verified CHECK (status <> 'CLOSED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))",
      );
    });

    it('enforces downtime duration integrity in downtime_records', () => {
      expect(migration001Sql).toContain(
        'CONSTRAINT chk_downtime_ended_after_started CHECK (ended_at IS NULL OR ended_at > started_at)',
      );
    });

    it('down migration 001 cleanly drops tables in reverse order', () => {
      const downSection = migration001Sql.split('-- Down Migration')[1] ?? '';
      expect(downSection).toContain('DROP TABLE IF EXISTS audit_logs');
      expect(downSection).toContain('DROP TABLE IF EXISTS capa_actions');
      expect(downSection).toContain('DROP TABLE IF EXISTS capa_cases');
      expect(downSection).toContain('DROP TABLE IF EXISTS downtime_records');
      expect(downSection).toContain('DROP TABLE IF EXISTS defect_records');
      expect(downSection).toContain('DROP TABLE IF EXISTS quality_inspections');
      expect(downSection).toContain('DROP TABLE IF EXISTS production_batches');
      expect(downSection).toContain('DROP TABLE IF EXISTS users');
    });

    it('down migration 002 cleanly drops refresh_sessions', () => {
      const downSection = migration002Sql.split('-- Down Migration')[1] ?? '';
      expect(downSection).toContain('DROP TABLE IF EXISTS refresh_sessions');
    });

    it('down migration 003 cleanly drops shifts is_active column and index', () => {
      const downSection = migration003Sql.split('-- Down Migration')[1] ?? '';
      expect(downSection).toContain('DROP INDEX IF EXISTS idx_shifts_is_active');
      expect(downSection).toContain('ALTER TABLE shifts DROP COLUMN IF EXISTS is_active');
    });
  });

  describe('Live Database Constraints (PostgreSQL Integration)', () => {
    it('executes live schema and constraint checks against PostgreSQL', async () => {
      const isCI = process.env.CI === 'true';
      const pool = new pg.Pool({
        connectionString: config.DATABASE_URL,
        connectionTimeoutMillis: 3000,
      });

      let client: pg.PoolClient | null = null;
      try {
        client = await pool.connect();
      } catch (err) {
        if (isCI) {
          // In CI environment, PostgreSQL service container MUST be accessible. Never silently skip.
          throw new Error(
            `Database connection failed in CI environment (${config.DATABASE_URL}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }

        // When running locally without local Docker/DB, log diagnostic notice
        console.log(
          '[Live Database Test] Local DB not currently accessible with default dev credentials; skipping live query assertions.',
        );
        await pool.end();
        return;
      }

      try {
        // 1. Verify connection
        const ping = await client.query('SELECT 1 AS live;');
        expect(ping.rows[0]?.live).toBe(1);

        // 2. Verify all migrated tables exist in information_schema
        const tablesResult = await client.query<{ table_name: string }>(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';",
        );
        const existingTables = new Set(tablesResult.rows.map((r) => r.table_name));

        const requiredTables = [
          'users',
          'roles',
          'user_roles',
          'products',
          'production_lines',
          'machines',
          'shifts',
          'defect_types',
          'production_batches',
          'quality_inspections',
          'defect_records',
          'downtime_records',
          'capa_cases',
          'capa_actions',
          'audit_logs',
          'refresh_sessions',
        ];

        for (const table of requiredTables) {
          expect(existingTables.has(table)).toBe(true);
        }

        // Verify shifts.is_active column added in migration 003
        const shiftColRes = await client.query<{ column_name: string }>(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'shifts' AND column_name = 'is_active';",
        );
        expect(shiftColRes.rows.length).toBe(1);

        // 3. Test check constraints inside an isolated rolled-back transaction
        await client.query('BEGIN;');

        // Seed minimal references for constraint tests
        const userRes = await client.query<{ id: string }>(
          "INSERT INTO users (username, email, password_hash, full_name) VALUES ('test_user', 'test@test.local', 'hash', 'Test User') RETURNING id;",
        );
        const userId = userRes.rows[0]?.id;

        const prodRes = await client.query<{ id: string }>(
          "INSERT INTO products (code, name) VALUES ('PRD-TEST-001', 'Test Product') RETURNING id;",
        );
        const prodId = prodRes.rows[0]?.id;

        const lineRes = await client.query<{ id: string }>(
          "INSERT INTO production_lines (code, name) VALUES ('LINE-TEST-001', 'Test Line') RETURNING id;",
        );
        const lineId = lineRes.rows[0]?.id;

        const shiftRes = await client.query<{ id: string }>(
          "INSERT INTO shifts (code, name, start_time, end_time) VALUES ('SHF-TEST-001', 'Test Shift', '08:00', '16:00') RETURNING id;",
        );
        const shiftId = shiftRes.rows[0]?.id;

        // Test A: Production batch disposition sum constraint
        // accepted(80) + scrap(30) = 110 > produced(100) -> MUST FAIL (code 23514)
        await assertConstraintViolation(
          client,
          () =>
            client.query(
              `INSERT INTO production_batches (
                batch_number, product_id, production_line_id, shift_id, planned_quantity, produced_quantity, accepted_quantity, scrap_quantity
              ) VALUES ('BATCH-TEST-FAIL-01', $1, $2, $3, 100, 100, 80, 30);`,
              [prodId, lineId, shiftId],
            ),
          'chk_batch_disposition_sum',
        );

        // Test B: Completed batch reconciliation constraint
        // status = 'COMPLETED', but accepted(50) != produced(100) -> MUST FAIL (code 23514)
        await assertConstraintViolation(
          client,
          () =>
            client.query(
              `INSERT INTO production_batches (
                batch_number, product_id, production_line_id, shift_id, status, planned_quantity, produced_quantity, accepted_quantity
              ) VALUES ('BATCH-TEST-FAIL-02', $1, $2, $3, 'COMPLETED', 100, 100, 50);`,
              [prodId, lineId, shiftId],
            ),
          'chk_batch_completed_reconciled',
        );

        // Insert valid batch for inspection tests
        const batchRes = await client.query<{ id: string }>(
          `INSERT INTO production_batches (
            batch_number, product_id, production_line_id, shift_id, planned_quantity, produced_quantity, accepted_quantity
          ) VALUES ('BATCH-TEST-OK-01', $1, $2, $3, 100, 100, 100) RETURNING id;`,
          [prodId, lineId, shiftId],
        );
        const batchId = batchRes.rows[0]?.id;
        expect(batchId).toBeDefined();

        // Test C: Quality inspection units sum constraint
        // sample_size = 10, passed(8) + failed(4) = 12 > 10 -> MUST FAIL (code 23514)
        await assertConstraintViolation(
          client,
          () =>
            client.query(
              `INSERT INTO quality_inspections (
                inspection_number, batch_id, inspector_id, stage, sample_size, passed_units, failed_units
              ) VALUES ('INS-TEST-FAIL-01', $1, $2, 'FINAL', 10, 8, 4);`,
              [batchId, userId],
            ),
          'chk_inspection_units_sum',
        );

        // Test D: CAPA closed verification constraint
        // status = 'CLOSED' without verified_by / verified_at -> MUST FAIL (code 23514)
        await assertConstraintViolation(
          client,
          () =>
            client.query(
              `INSERT INTO capa_cases (
                case_number, title, description, source, status, created_by
              ) VALUES ('CAPA-TEST-FAIL-01', 'Test Title', 'Test Desc', 'PROCESS_DEVIATION', 'CLOSED', $1);`,
              [userId],
            ),
          'chk_capa_closed_verified',
        );

        // Test E: Downtime end after start constraint
        // ended_at <= started_at -> MUST FAIL (code 23514)
        await assertConstraintViolation(
          client,
          () =>
            client.query(
              `INSERT INTO downtime_records (
                production_line_id, reason, started_at, ended_at
              ) VALUES ($1, 'Test Breakdown', '2026-10-23 10:00:00+00', '2026-10-23 09:00:00+00');`,
              [lineId],
            ),
          'chk_downtime_ended_after_started',
        );

        // Test F: Refresh session revoked_at must not be before created_at
        await assertConstraintViolation(
          client,
          () =>
            client.query(
              `INSERT INTO refresh_sessions (
                user_id, token_hash, expires_at, created_at, revoked_at
              ) VALUES ($1, 'dummy_token_hash_value_for_constraint_check', '2026-10-31 00:00:00+00', '2026-10-24 10:00:00+00', '2026-10-24 09:00:00+00');`,
              [userId],
            ),
          'chk_refresh_sessions_revoked_after_created',
        );

        // Clean up transaction
        await client.query('ROLLBACK;');
      } finally {
        if (client) {
          try {
            await client.query('ROLLBACK;');
          } catch {
            // Transaction may already be rolled back
          }
          client.release();
        }
        await pool.end();
      }
    });
  });
});
