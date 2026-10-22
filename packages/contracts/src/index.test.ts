import { describe, expect, it } from 'vitest';
import { HealthResponseSchema, HealthStatusSchema } from './index.js';

describe('Contracts — Foundation Schemas', () => {
  it('validates a correct health response payload', () => {
    const validPayload = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'qualityops-api',
      version: '0.1.0',
    };

    const parsed = HealthResponseSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('ok');
      expect(parsed.data.service).toBe('qualityops-api');
    }
  });

  it('rejects an invalid status', () => {
    const invalidPayload = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'qualityops-api',
      version: '0.1.0',
    };

    const parsed = HealthResponseSchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
  });

  it('rejects an invalid timestamp format', () => {
    const invalidPayload = {
      status: 'ok',
      timestamp: 'not-a-datetime',
      service: 'qualityops-api',
      version: '0.1.0',
    };

    const parsed = HealthResponseSchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
  });

  it('validates health status enum values', () => {
    expect(HealthStatusSchema.safeParse('ok').success).toBe(true);
    expect(HealthStatusSchema.safeParse('degraded').success).toBe(true);
    expect(HealthStatusSchema.safeParse('error').success).toBe(true);
    expect(HealthStatusSchema.safeParse('running').success).toBe(false);
  });
});
