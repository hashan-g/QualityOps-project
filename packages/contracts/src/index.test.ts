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
  IdParamSchema,
  CreateProductRequestSchema,
  ProductSchema,
  CreateProductionLineRequestSchema,
  CreateMachineRequestSchema,
  CreateShiftRequestSchema,
  CreateDefectTypeRequestSchema,
  MachineStatusSchema,
  DefectSeveritySchema,
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

describe('Contracts — Phase 4 Master Data Management Schemas', () => {
  it('validates IdParamSchema UUID constraints', () => {
    expect(IdParamSchema.safeParse({ id: '11111111-1111-1111-1111-111111111111' }).success).toBe(
      true,
    );
    expect(IdParamSchema.safeParse({ id: 'invalid-uuid-string' }).success).toBe(false);
  });

  it('validates Product schemas', () => {
    const validProduct = {
      id: '22222222-2222-2222-2222-222222222222',
      code: 'PRD-001',
      name: 'Turbine Blade X1',
      description: 'Precision aerospace turbine blade',
      targetCycleTimeSeconds: 120.5,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(ProductSchema.safeParse(validProduct).success).toBe(true);

    // Create request with invalid cycle time (<= 0)
    expect(
      CreateProductRequestSchema.safeParse({
        code: 'PRD-002',
        name: 'Invalid Product',
        targetCycleTimeSeconds: -5,
      }).success,
    ).toBe(false);

    // Create request with empty code
    expect(
      CreateProductRequestSchema.safeParse({
        code: '',
        name: 'Valid Name',
      }).success,
    ).toBe(false);
  });

  it('validates ProductionLine schemas', () => {
    expect(
      CreateProductionLineRequestSchema.safeParse({
        code: 'LINE-A',
        name: 'Assembly Line Alpha',
        location: 'Building 1 - Bay 4',
      }).success,
    ).toBe(true);

    expect(
      CreateProductionLineRequestSchema.safeParse({
        code: '',
        name: 'Missing Code Line',
      }).success,
    ).toBe(false);
  });

  it('validates Machine schemas and status enum', () => {
    const statuses = ['IDLE', 'RUNNING', 'DOWN', 'MAINTENANCE'];
    for (const status of statuses) {
      expect(MachineStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(MachineStatusSchema.safeParse('BROKEN').success).toBe(false);

    const validMachine = {
      code: 'MCH-01',
      name: 'CNC Milling Center 5-Axis',
      productionLineId: '33333333-3333-3333-3333-333333333333',
      status: 'IDLE',
    };
    expect(CreateMachineRequestSchema.safeParse(validMachine).success).toBe(true);

    // Invalid UUID for productionLineId
    expect(
      CreateMachineRequestSchema.safeParse({
        ...validMachine,
        productionLineId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('validates Shift schemas and supports overnight 24h clock times', () => {
    // Standard morning shift
    expect(
      CreateShiftRequestSchema.safeParse({
        code: 'SHF-MORNING',
        name: 'Day Shift',
        startTime: '08:00',
        endTime: '16:00',
      }).success,
    ).toBe(true);

    // Valid overnight shift: 22:00 to 06:00
    expect(
      CreateShiftRequestSchema.safeParse({
        code: 'SHF-NIGHT',
        name: 'Night Graveyard Shift',
        startTime: '22:00:00',
        endTime: '06:00:00',
      }).success,
    ).toBe(true);

    // Invalid time strings
    expect(
      CreateShiftRequestSchema.safeParse({
        code: 'SHF-INVALID',
        name: 'Bad Shift',
        startTime: '25:00',
        endTime: '16:00',
      }).success,
    ).toBe(false);

    expect(
      CreateShiftRequestSchema.safeParse({
        code: 'SHF-INVALID-2',
        name: 'Bad Shift 2',
        startTime: '08:70',
        endTime: '16:00',
      }).success,
    ).toBe(false);
  });

  it('validates DefectType schemas and severity tiers', () => {
    const severities = ['MINOR', 'MAJOR', 'CRITICAL'];
    for (const s of severities) {
      expect(DefectSeveritySchema.safeParse(s).success).toBe(true);
    }
    expect(DefectSeveritySchema.safeParse('BLOCKER').success).toBe(false);

    expect(
      CreateDefectTypeRequestSchema.safeParse({
        code: 'DEF-MICRO-CRACK',
        name: 'Surface Micro-fracture',
        category: 'STRUCTURAL',
        severity: 'CRITICAL',
      }).success,
    ).toBe(true);

    expect(
      CreateDefectTypeRequestSchema.safeParse({
        code: '',
        name: 'Missing Code',
        category: 'VISUAL',
      }).success,
    ).toBe(false);
  });
});
