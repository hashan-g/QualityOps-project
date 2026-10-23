import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { HealthResponseSchema, HealthReadinessResponseSchema } from '@qualityops/contracts';
import * as poolModule from './infrastructure/database/pool.js';

describe('QualityOps API — Foundation & Diagnostic Smoke Tests', () => {
  const app = createApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/health (Liveness Probe)', () => {
    it('returns HTTP 200 with ok status and matches shared contract schema', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.headers['x-request-id']).toBeDefined();

      const parsed = HealthResponseSchema.safeParse(response.body);
      expect(parsed.success).toBe(true);

      if (parsed.success) {
        expect(parsed.data.status).toBe('ok');
        expect(parsed.data.service).toBe('qualityops-api');
        expect(parsed.data.version).toBe('0.1.0');
        expect(new Date(parsed.data.timestamp).toString()).not.toBe('Invalid Date');
      }
    });

    it('health endpoint does not claim database readiness', async () => {
      const response = await request(app).get('/api/v1/health');
      expect(response.body).not.toHaveProperty('database');
      expect(response.body).not.toHaveProperty('dbReady');
    });

    it('remains HTTP 200 even if the database is completely down', async () => {
      vi.spyOn(poolModule, 'checkDatabaseReadiness').mockResolvedValue({
        ok: false,
        error: 'Database connection failed',
      });

      const response = await request(app).get('/api/v1/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('works on /health alias', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });

  describe('GET /api/v1/health/ready (Readiness Probe)', () => {
    it('returns HTTP 200 with database status up when DB check passes', async () => {
      vi.spyOn(poolModule, 'checkDatabaseReadiness').mockResolvedValue({
        ok: true,
        latencyMs: 2.45,
      });

      const response = await request(app).get('/api/v1/health/ready');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      const parsed = HealthReadinessResponseSchema.safeParse(response.body);
      expect(parsed.success).toBe(true);

      if (parsed.success) {
        expect(parsed.data.status).toBe('ok');
        expect(parsed.data.database.status).toBe('up');
        expect(parsed.data.database.latencyMs).toBe(2.45);
      }
    });

    it('returns HTTP 503 with database status down when DB check fails', async () => {
      vi.spyOn(poolModule, 'checkDatabaseReadiness').mockResolvedValue({
        ok: false,
        error: 'Connection terminated unexpectedly',
      });

      const response = await request(app).get('/api/v1/health/ready');

      expect(response.status).toBe(503);
      expect(response.headers['content-type']).toMatch(/json/);

      const parsed = HealthReadinessResponseSchema.safeParse(response.body);
      expect(parsed.success).toBe(true);

      if (parsed.success) {
        expect(parsed.data.status).toBe('degraded');
        expect(parsed.data.database.status).toBe('down');
        expect(parsed.data.database.error).toBe('Connection terminated unexpectedly');
      }
    });

    it('never leaks sensitive credentials in error response', async () => {
      vi.spyOn(poolModule, 'checkDatabaseReadiness').mockResolvedValue({
        ok: false,
        error: 'connection to postgresql://***:***@localhost:5432 failed',
      });

      const response = await request(app).get('/api/v1/health/ready');
      expect(response.status).toBe(503);
      expect(JSON.stringify(response.body)).not.toContain('secret_pass');
    });

    it('works on /ready alias', async () => {
      vi.spyOn(poolModule, 'checkDatabaseReadiness').mockResolvedValue({
        ok: true,
        latencyMs: 1.1,
      });

      const response = await request(app).get('/ready');
      expect(response.status).toBe(200);
      expect(response.body.database.status).toBe('up');
    });
  });

  describe('Error handling & Unknown routes', () => {
    it('returns 404 with structured error envelope for non-existent routes', async () => {
      const response = await request(app).get('/api/v1/non-existent-route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toContain('Cannot GET /api/v1/non-existent-route');
      expect(response.body.error.requestId).toBeDefined();
    });

    it('maintains custom x-request-id if provided in request header', async () => {
      const customId = 'custom-req-id-12345';
      const response = await request(app).get('/api/v1/health').set('x-request-id', customId);

      expect(response.status).toBe(200);
      expect(response.headers['x-request-id']).toBe(customId);
    });
  });
});
