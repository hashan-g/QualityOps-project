import { describe, expect, it } from 'vitest';
import {
  HealthReadinessResponseSchema,
  HealthResponseSchema,
  HealthStatusSchema,
  DatabaseStatusSchema,
} from './index.js';

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

  it('validates a database readiness response payload', () => {
    const validPayload = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'qualityops-api',
      version: '0.1.0',
      database: {
        status: 'up',
        latencyMs: 1.5,
      },
    };

    const parsed = HealthReadinessResponseSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.database.status).toBe('up');
      expect(parsed.data.database.latencyMs).toBe(1.5);
    }
  });

  it('validates a degraded database readiness response payload with error info', () => {
    const degradedPayload = {
      status: 'degraded',
      timestamp: new Date().toISOString(),
      service: 'qualityops-api',
      version: '0.1.0',
      database: {
        status: 'down',
        error: 'Database connection failed',
      },
    };

    const parsed = HealthReadinessResponseSchema.safeParse(degradedPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('degraded');
      expect(parsed.data.database.status).toBe('down');
      expect(parsed.data.database.error).toBe('Database connection failed');
    }
  });

  it('validates database status enum values', () => {
    expect(DatabaseStatusSchema.safeParse('up').success).toBe(true);
    expect(DatabaseStatusSchema.safeParse('down').success).toBe(true);
    expect(DatabaseStatusSchema.safeParse('degraded').success).toBe(true);
    expect(DatabaseStatusSchema.safeParse('offline').success).toBe(false);
  });
});
