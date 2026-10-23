import pg from 'pg';
import type { QueryResult, QueryResultRow } from 'pg';
import { config } from '../../config.js';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;

export function createPool(overrideConfig?: pg.PoolConfig): pg.Pool {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: config.DB_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: config.DB_POOL_CONNECTION_TIMEOUT_MS,
    ...overrideConfig,
  });

  pool.on('error', (err: Error) => {
    // Avoid crashing on idle client network hiccups; log securely
    console.error('[Database Pool] Unexpected idle client error:', err.message);
  });

  return pool;
}

export function getPool(): pg.Pool {
  if (!poolInstance) {
    poolInstance = createPool();
  }
  return poolInstance;
}

export function setPool(customPool: pg.Pool | null): void {
  poolInstance = customPool;
}

export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  const pool = getPool();
  return pool.query<R>(text, params);
}

export interface DatabaseReadinessResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export async function checkDatabaseReadiness(
  timeoutMs = config.DB_POOL_CONNECTION_TIMEOUT_MS,
): Promise<DatabaseReadinessResult> {
  const start = performance.now();
  try {
    const pool = getPool();

    // Enforce timeout using a race condition
    const queryPromise = pool.query('SELECT 1 AS ready;');
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Database readiness check timed out')), timeoutMs).unref();
    });

    await Promise.race([queryPromise, timeoutPromise]);
    const duration = performance.now() - start;

    return {
      ok: true,
      latencyMs: Math.round(duration * 100) / 100,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Database check failed';
    // Sanitize message to never leak passwords or sensitive parameters
    const sanitized = message.replace(/:\/\/[^@]+@/, '://***:***@');
    return {
      ok: false,
      error: sanitized,
    };
  }
}

export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}
