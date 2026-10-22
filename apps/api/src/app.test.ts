import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { HealthResponseSchema } from '@qualityops/contracts';

describe('QualityOps API — Foundation Smoke Tests', () => {
  const app = createApp();

  describe('GET /api/v1/health', () => {
    it('returns HTTP 200 with ok status and matches shared contract schema', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.headers['x-request-id']).toBeDefined();

      // Schema validation via @qualityops/contracts
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
      // Verify no premature database status or connection claim is present
      expect(response.body).not.toHaveProperty('database');
      expect(response.body).not.toHaveProperty('dbReady');
    });

    it('works on /health alias', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
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
