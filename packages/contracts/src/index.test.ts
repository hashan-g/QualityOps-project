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
  BatchStatusSchema,
  CreateProductionBatchRequestSchema,
  UpdateProductionBatchRequestSchema,
  CreateDowntimeRequestSchema,
  CloseDowntimeRequestSchema,
  DowntimeCategorySchema,
  InspectionStageSchema,
  InspectionStatusSchema,
  InspectionResultSchema,
  QualityInspectionSchema,
  CreateInspectionRequestSchema,
  UpdateInspectionRequestSchema,
  InspectionListQuerySchema,
  InspectionListResponseSchema,
  DefectRecordSchema,
  CreateDefectRecordRequestSchema,
  UpdateDefectRecordRequestSchema,
  DefectRecordListQuerySchema,
  DefectRecordListResponseSchema,
  DefectAnalyticsFilterSchema,
  DefectAnalyticsResponseSchema,
  DefectParetoItemSchema,
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

  describe('Phase 5 — Production Management Schemas', () => {
    it('validates canonical batch status enum values', () => {
      const valid = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ON_HOLD'];
      for (const s of valid) {
        expect(BatchStatusSchema.safeParse(s).success).toBe(true);
      }
      expect(BatchStatusSchema.safeParse('UNKNOWN').success).toBe(false);
      expect(BatchStatusSchema.safeParse('FINISHED').success).toBe(false);
    });

    it('validates CreateProductionBatchRequestSchema invariants', () => {
      const valid = {
        batchNumber: 'BATCH-2026-001',
        productId: '11111111-1111-1111-1111-111111111111',
        productionLineId: '22222222-2222-2222-2222-222222222222',
        shiftId: '33333333-3333-3333-3333-333333333333',
        plannedQuantity: 500,
      };
      expect(CreateProductionBatchRequestSchema.safeParse(valid).success).toBe(true);

      // Non-positive planned quantity rejected
      expect(
        CreateProductionBatchRequestSchema.safeParse({
          ...valid,
          plannedQuantity: 0,
        }).success,
      ).toBe(false);

      expect(
        CreateProductionBatchRequestSchema.safeParse({
          ...valid,
          plannedQuantity: -10,
        }).success,
      ).toBe(false);

      // Invalid UUIDs rejected
      expect(
        CreateProductionBatchRequestSchema.safeParse({
          ...valid,
          productId: 'not-a-uuid',
        }).success,
      ).toBe(false);
    });

    it('enforces chk_batch_disposition_sum on batch quantity updates', () => {
      // Valid disposition sum: 80 + 10 + 10 = 100 <= 100
      const valid = {
        producedQuantity: 100,
        acceptedQuantity: 80,
        scrapQuantity: 10,
        reworkPendingQuantity: 10,
      };
      expect(UpdateProductionBatchRequestSchema.safeParse(valid).success).toBe(true);

      // In-progress partial disposition: 50 + 0 + 0 = 50 <= 100 is valid
      expect(
        UpdateProductionBatchRequestSchema.safeParse({
          producedQuantity: 100,
          acceptedQuantity: 50,
          scrapQuantity: 0,
          reworkPendingQuantity: 0,
        }).success,
      ).toBe(true);

      // Invalid disposition: 80 + 30 + 0 = 110 > 100 must fail
      const invalid = {
        producedQuantity: 100,
        acceptedQuantity: 80,
        scrapQuantity: 30,
        reworkPendingQuantity: 0,
      };
      const res = UpdateProductionBatchRequestSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('Disposition sum');
      }
    });

    it('enforces chk_batch_completed_reconciled when status is COMPLETED', () => {
      // Reconciled completed batch: 90 + 5 + 5 = 100 === 100
      const reconciled = {
        status: 'COMPLETED' as const,
        producedQuantity: 100,
        acceptedQuantity: 90,
        scrapQuantity: 5,
        reworkPendingQuantity: 5,
      };
      expect(UpdateProductionBatchRequestSchema.safeParse(reconciled).success).toBe(true);

      // Unreconciled completed batch: 80 + 0 + 0 = 80 !== 100 must fail
      const unreconciled = {
        status: 'COMPLETED' as const,
        producedQuantity: 100,
        acceptedQuantity: 80,
        scrapQuantity: 0,
        reworkPendingQuantity: 0,
      };
      const res = UpdateProductionBatchRequestSchema.safeParse(unreconciled);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('must exactly equal produced quantity');
      }
    });

    it('enforces timestamp ordering on batch and downtime updates', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 3600000);

      // Completed earlier than started must fail
      expect(
        UpdateProductionBatchRequestSchema.safeParse({
          startedAt: now.toISOString(),
          completedAt: past.toISOString(),
        }).success,
      ).toBe(false);

      // Downtime ended earlier or equal to started must fail
      expect(
        CreateDowntimeRequestSchema.safeParse({
          productionLineId: '11111111-1111-1111-1111-111111111111',
          reason: 'Jam on feeder',
          startedAt: now.toISOString(),
          endedAt: past.toISOString(),
        }).success,
      ).toBe(false);

      expect(
        CreateDowntimeRequestSchema.safeParse({
          productionLineId: '11111111-1111-1111-1111-111111111111',
          reason: 'Jam on feeder',
          startedAt: now.toISOString(),
          endedAt: now.toISOString(),
        }).success,
      ).toBe(false);

      // Downtime ended after started is valid
      const future = new Date(now.getTime() + 1800000);
      expect(
        CreateDowntimeRequestSchema.safeParse({
          productionLineId: '11111111-1111-1111-1111-111111111111',
          reason: 'Jam on feeder',
          category: 'UNPLANNED',
          startedAt: now.toISOString(),
          endedAt: future.toISOString(),
        }).success,
      ).toBe(true);
    });

    it('validates CloseDowntimeRequestSchema', () => {
      expect(
        CloseDowntimeRequestSchema.safeParse({
          endedAt: new Date().toISOString(),
          notes: 'Motor cleared and restarted',
        }).success,
      ).toBe(true);

      expect(
        CloseDowntimeRequestSchema.safeParse({
          endedAt: 'invalid-time',
        }).success,
      ).toBe(false);
    });

    it('validates downtime category enum', () => {
      expect(DowntimeCategorySchema.safeParse('PLANNED').success).toBe(true);
      expect(DowntimeCategorySchema.safeParse('UNPLANNED').success).toBe(true);
      expect(DowntimeCategorySchema.safeParse('OTHER').success).toBe(false);
    });
  });

  describe('Phase 6: Quality Inspection Schemas', () => {
    const validBatchId = '11111111-1111-1111-1111-111111111111';

    it('validates inspection stage, status, and result enums', () => {
      const stages = ['IN_PROCESS', 'FINAL', 'RECEIVING', 'FIRST_ARTICLE'];
      for (const stage of stages) {
        expect(InspectionStageSchema.safeParse(stage).success).toBe(true);
      }
      expect(InspectionStageSchema.safeParse('UNKNOWN_STAGE').success).toBe(false);

      const statuses = ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
      for (const status of statuses) {
        expect(InspectionStatusSchema.safeParse(status).success).toBe(true);
      }
      expect(InspectionStatusSchema.safeParse('PENDING').success).toBe(false);

      const results = ['PASS', 'FAIL', 'CONDITIONAL'];
      for (const res of results) {
        expect(InspectionResultSchema.safeParse(res).success).toBe(true);
      }
      expect(InspectionResultSchema.safeParse('REJECTED').success).toBe(false);
    });

    it('accepts valid CreateInspectionRequest payload with reconciled sample', () => {
      const valid = {
        batchId: validBatchId,
        stage: 'FINAL',
        sampleSize: 10,
        passedUnits: 8,
        failedUnits: 2,
        status: 'COMPLETED' as const,
        result: 'FAIL' as const,
        notes: 'Two surface scratches observed',
      };
      const res = CreateInspectionRequestSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('accepts valid PASS inspection when failedUnits is 0', () => {
      const validPass = {
        batchId: validBatchId,
        stage: 'IN_PROCESS',
        sampleSize: 5,
        passedUnits: 5,
        failedUnits: 0,
        status: 'COMPLETED' as const,
        result: 'PASS' as const,
      };
      expect(CreateInspectionRequestSchema.safeParse(validPass).success).toBe(true);
    });

    it('rejects sampleSize <= 0', () => {
      expect(
        CreateInspectionRequestSchema.safeParse({
          batchId: validBatchId,
          stage: 'FINAL',
          sampleSize: 0,
          passedUnits: 0,
          failedUnits: 0,
        }).success,
      ).toBe(false);

      expect(
        CreateInspectionRequestSchema.safeParse({
          batchId: validBatchId,
          stage: 'FINAL',
          sampleSize: -5,
          passedUnits: 0,
          failedUnits: 0,
        }).success,
      ).toBe(false);
    });

    it('rejects negative passed or failed counts', () => {
      expect(
        CreateInspectionRequestSchema.safeParse({
          batchId: validBatchId,
          stage: 'FINAL',
          sampleSize: 10,
          passedUnits: -1,
          failedUnits: 11,
        }).success,
      ).toBe(false);

      expect(
        CreateInspectionRequestSchema.safeParse({
          batchId: validBatchId,
          stage: 'FINAL',
          sampleSize: 10,
          passedUnits: 10,
          failedUnits: -2,
        }).success,
      ).toBe(false);
    });

    it('rejects when passed + failed units exceed sample size', () => {
      expect(
        CreateInspectionRequestSchema.safeParse({
          batchId: validBatchId,
          stage: 'FINAL',
          sampleSize: 10,
          passedUnits: 8,
          failedUnits: 5, // 8 + 5 = 13 > 10
        }).success,
      ).toBe(false);
    });

    it('rejects COMPLETED status when sample is not fully reconciled', () => {
      expect(
        CreateInspectionRequestSchema.safeParse({
          batchId: validBatchId,
          stage: 'FINAL',
          sampleSize: 10,
          passedUnits: 6,
          failedUnits: 2, // 6 + 2 = 8 != 10
          status: 'COMPLETED',
        }).success,
      ).toBe(false);
    });

    it('allows IN_PROGRESS status when sample is partially classified', () => {
      expect(
        CreateInspectionRequestSchema.safeParse({
          batchId: validBatchId,
          stage: 'FINAL',
          sampleSize: 10,
          passedUnits: 4,
          failedUnits: 1, // 5 out of 10 evaluated
          status: 'IN_PROGRESS',
        }).success,
      ).toBe(true);
    });

    it('rejects contradictory PASS result when failedUnits > 0', () => {
      expect(
        CreateInspectionRequestSchema.safeParse({
          batchId: validBatchId,
          stage: 'FINAL',
          sampleSize: 10,
          passedUnits: 7,
          failedUnits: 3,
          status: 'COMPLETED',
          result: 'PASS', // Contradiction: 3 failed units cannot be PASS
        }).success,
      ).toBe(false);
    });

    it('validates UpdateInspectionRequestSchema with boundary rules', () => {
      expect(
        UpdateInspectionRequestSchema.safeParse({
          sampleSize: 10,
          passedUnits: 9,
          failedUnits: 1,
          status: 'COMPLETED',
          result: 'FAIL',
          reasonForCorrection: 'Recalculated sample metrics after re-verification',
        }).success,
      ).toBe(true);

      // Rejects contradictory result
      expect(
        UpdateInspectionRequestSchema.safeParse({
          sampleSize: 10,
          passedUnits: 8,
          failedUnits: 2,
          result: 'PASS',
        }).success,
      ).toBe(false);
    });

    it('validates QualityInspectionSchema, InspectionListQuerySchema, and InspectionListResponseSchema', () => {
      const validInspection = {
        id: '11111111-1111-1111-1111-111111111111',
        inspectionNumber: 'INSP-20261025-0001',
        batchId: validBatchId,
        inspectorId: '22222222-2222-2222-2222-222222222222',
        stage: 'FINAL',
        attemptNumber: 1,
        status: 'COMPLETED',
        result: 'PASS',
        sampleSize: 10,
        passedUnits: 10,
        failedUnits: 0,
        inspectedAt: new Date().toISOString(),
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        batchNumber: 'BATCH-2026-001',
        productCode: 'PRD-01',
        productName: 'Gearbox',
        inspectorUsername: 'inspector1',
        inspectorFullName: 'Inspector One',
      };

      const parsedInspection = QualityInspectionSchema.safeParse(validInspection);
      expect(parsedInspection.success).toBe(true);

      const parsedQuery = InspectionListQuerySchema.safeParse({
        page: 1,
        limit: 20,
        stage: 'FINAL',
        status: 'COMPLETED',
        result: 'PASS',
        search: 'INSP-2026',
      });
      expect(parsedQuery.success).toBe(true);

      const parsedResponse = InspectionListResponseSchema.safeParse({
        items: [validInspection],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(parsedResponse.success).toBe(true);
    });
  });

  describe('Contracts — Phase 7 Defect Management & Analytics Schemas', () => {
    const validInspectionId = '55555555-5555-5555-5555-555555555555';
    const validDefectTypeId = '66666666-6666-6666-6666-666666666666';

    it('validates a correct CreateDefectRecordRequestSchema payload', () => {
      const valid = {
        inspectionId: validInspectionId,
        defectTypeId: validDefectTypeId,
        occurrenceCount: 3,
        affectedUnitCount: 2,
        notes: 'Two units exhibited scratch markings',
      };
      const res = CreateDefectRecordRequestSchema.safeParse(valid);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.occurrenceCount).toBe(3);
        expect(res.data.affectedUnitCount).toBe(2);
      }
    });

    it('rejects CreateDefectRecordRequestSchema when affectedUnitCount > occurrenceCount', () => {
      const invalid = {
        inspectionId: validInspectionId,
        defectTypeId: validDefectTypeId,
        occurrenceCount: 2,
        affectedUnitCount: 3, // 3 > 2 -> Must fail!
      };
      const res = CreateDefectRecordRequestSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain(
          'Affected unit count cannot exceed occurrence count',
        );
      }
    });

    it('rejects zero and negative counts in CreateDefectRecordRequestSchema', () => {
      expect(
        CreateDefectRecordRequestSchema.safeParse({
          inspectionId: validInspectionId,
          defectTypeId: validDefectTypeId,
          occurrenceCount: 0,
          affectedUnitCount: 0,
        }).success,
      ).toBe(false);

      expect(
        CreateDefectRecordRequestSchema.safeParse({
          inspectionId: validInspectionId,
          defectTypeId: validDefectTypeId,
          occurrenceCount: -1,
          affectedUnitCount: 1,
        }).success,
      ).toBe(false);
    });

    it('validates UpdateDefectRecordRequestSchema with required reasonForCorrection', () => {
      const valid = {
        occurrenceCount: 5,
        affectedUnitCount: 4,
        reasonForCorrection: 'Recounted defect occurrences on sample unit #2',
      };
      expect(UpdateDefectRecordRequestSchema.safeParse(valid).success).toBe(true);

      // Rejects empty or missing reasonForCorrection
      expect(
        UpdateDefectRecordRequestSchema.safeParse({
          occurrenceCount: 5,
          reasonForCorrection: '',
        }).success,
      ).toBe(false);

      // Rejects affectedUnitCount > occurrenceCount
      expect(
        UpdateDefectRecordRequestSchema.safeParse({
          occurrenceCount: 2,
          affectedUnitCount: 4,
          reasonForCorrection: 'Adjustment',
        }).success,
      ).toBe(false);
    });

    it('validates DefectRecordSchema, Query, and List Response schemas', () => {
      const mockRecord = {
        id: '77777777-7777-7777-7777-777777777777',
        inspectionId: validInspectionId,
        defectTypeId: validDefectTypeId,
        occurrenceCount: 4,
        affectedUnitCount: 3,
        notes: 'Pitted surface finish',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        defectTypeCode: 'DEF-001',
        defectTypeName: 'Surface Pitting',
        defectTypeCategory: 'SURFACE',
        defectTypeSeverity: 'MAJOR' as const,
        inspectionNumber: 'INSP-20261026-0001',
        inspectionStage: 'FINAL',
        batchNumber: 'BATCH-2026-001',
        productCode: 'PRD-01',
        productName: 'Precision Gearbox',
      };

      expect(DefectRecordSchema.safeParse(mockRecord).success).toBe(true);

      const queryRes = DefectRecordListQuerySchema.safeParse({
        page: 1,
        limit: 20,
        severity: 'MAJOR',
        search: 'Surface',
      });
      expect(queryRes.success).toBe(true);

      const listRes = DefectRecordListResponseSchema.safeParse({
        items: [mockRecord],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(listRes.success).toBe(true);
    });

    it('validates DefectAnalyticsFilterSchema and DefectAnalyticsResponseSchema', () => {
      const filterRes = DefectAnalyticsFilterSchema.safeParse({
        severity: 'CRITICAL',
        trendInterval: 'WEEK',
      });
      expect(filterRes.success).toBe(true);

      const paretoItem = {
        defectTypeId: validDefectTypeId,
        code: 'DEF-001',
        name: 'Surface Scratch',
        category: 'SURFACE',
        severity: 'MINOR' as const,
        measure: 'affectedUnitCount' as const,
        value: 10,
        percentage: 50,
        cumulativePercentage: 50,
      };
      expect(DefectParetoItemSchema.safeParse(paretoItem).success).toBe(true);

      const analyticsRes = DefectAnalyticsResponseSchema.safeParse({
        overview: {
          totalFindings: 2,
          totalOccurrences: 8,
          totalAffectedUnitsAcrossFindings: 5,
        },
        byType: [
          {
            defectTypeId: validDefectTypeId,
            code: 'DEF-001',
            name: 'Surface Scratch',
            category: 'SURFACE',
            severity: 'MINOR',
            findingCount: 1,
            occurrenceCount: 4,
            affectedUnitCount: 3,
          },
        ],
        bySeverity: [
          {
            severity: 'MINOR',
            findingCount: 1,
            occurrenceCount: 4,
            affectedUnitCount: 3,
          },
        ],
        byProduct: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            code: 'PRD-01',
            name: 'Gearbox',
            findingCount: 1,
            occurrenceCount: 4,
            affectedUnitCount: 3,
          },
        ],
        byProductionLine: [],
        byMachine: [],
        byShift: [],
        trend: [
          {
            period: '2026-10-26',
            findingCount: 1,
            occurrenceCount: 4,
            affectedUnitCount: 3,
          },
        ],
        pareto: [paretoItem],
      });
      expect(analyticsRes.success).toBe(true);
    });
  });
});
