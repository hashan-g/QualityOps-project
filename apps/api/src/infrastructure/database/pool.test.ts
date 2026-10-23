import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import pg from 'pg';
import { checkDatabaseReadiness, closePool, setPool, createPool } from './pool.js';

describe('Database Pool & Readiness Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await closePool();
    setPool(null);
  });

  it('reports database as ready when SELECT 1 succeeds', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ ready: 1 }] }),
      end: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    } as unknown as pg.Pool;

    setPool(mockPool);

    const result = await checkDatabaseReadiness(1000);
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeTypeOf('number');
    expect(result.error).toBeUndefined();
    expect(mockPool.query).toHaveBeenCalledWith('SELECT 1 AS ready;');
  });

  it('reports database as not ready and sanitizes connection errors', async () => {
    const mockPool = {
      query: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'connection to postgresql://qualityops_dev:secret_pass@127.0.0.1:5432/qualityops failed',
          ),
        ),
      end: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    } as unknown as pg.Pool;

    setPool(mockPool);

    const result = await checkDatabaseReadiness(1000);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    // Verify credentials are sanitized and never leaked
    expect(result.error).not.toContain('secret_pass');
    expect(result.error).toContain('://***:***@');
  });

  it('handles query timeout during readiness check', async () => {
    const mockPool = {
      query: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 500))),
      end: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    } as unknown as pg.Pool;

    setPool(mockPool);

    // Set tight timeout of 50ms
    const result = await checkDatabaseReadiness(50);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('creates a bounded pool instance with error handler', () => {
    const pool = createPool({ max: 5 });
    expect(pool).toBeDefined();
    expect(pool.options.max).toBe(5);
    void pool.end();
  });
});
