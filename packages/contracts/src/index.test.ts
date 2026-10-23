import { describe, expect, it } from 'vitest';
import {
  HealthReadinessResponseSchema,
  HealthResponseSchema,
  HealthStatusSchema,
  DatabaseStatusSchema,
  CanonicalRoleSchema,
  LoginRequestSchema,
  CreateUserRequestSchema,
  UserResponseSchema,
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

describe('Contracts — Phase 3 Identity & RBAC Schemas', () => {
  it('validates canonical roles', () => {
    const validRoles = [
      'ADMIN',
      'QUALITY_MANAGER',
      'SUPERVISOR',
      'INSPECTOR',
      'OPERATOR',
      'VIEWER',
    ];
    for (const role of validRoles) {
      expect(CanonicalRoleSchema.safeParse(role).success).toBe(true);
    }
    expect(CanonicalRoleSchema.safeParse('SUPERUSER').success).toBe(false);
    expect(CanonicalRoleSchema.safeParse('ROOT').success).toBe(false);
  });

  it('validates LoginRequestSchema requirements', () => {
    expect(
      LoginRequestSchema.safeParse({ username: 'user1', password: 'password123' }).success,
    ).toBe(true);
    expect(LoginRequestSchema.safeParse({ username: '', password: 'password123' }).success).toBe(
      false,
    );
    expect(LoginRequestSchema.safeParse({ username: 'user1', password: '' }).success).toBe(false);
  });

  it('validates CreateUserRequestSchema constraints', () => {
    const valid = {
      username: 'inspector_bob',
      email: 'bob@qualityops.local',
      password: 'StrongPassword123!',
      fullName: 'Bob Inspector',
      roles: ['INSPECTOR'],
    };
    expect(CreateUserRequestSchema.safeParse(valid).success).toBe(true);

    // Too short password
    expect(CreateUserRequestSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);

    // Invalid email
    expect(CreateUserRequestSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(
      false,
    );

    // Invalid username characters
    expect(
      CreateUserRequestSchema.safeParse({ ...valid, username: 'invalid name with spaces' }).success,
    ).toBe(false);
  });

  it('validates UserResponseSchema structure', () => {
    const userPayload = {
      id: '11111111-1111-1111-1111-111111111111',
      username: 'admin',
      email: 'admin@qualityops.local',
      fullName: 'System Administrator',
      isActive: true,
      roles: ['ADMIN'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(UserResponseSchema.safeParse(userPayload).success).toBe(true);
  });
});
