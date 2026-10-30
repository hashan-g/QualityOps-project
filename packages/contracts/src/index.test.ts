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
  CapaSourceSchema,
  CapaStatusSchema,
  CapaPrioritySchema,
  CapaActionTypeSchema,
  CapaActionStatusSchema,
  CapaActionSchema,
  CapaCaseSchema,
  CreateCapaCaseRequestSchema,
  UpdateCapaCaseRequestSchema,
  VerifyCapaCaseRequestSchema,
  CloseCapaCaseRequestSchema,
  CreateCapaActionRequestSchema,
  UpdateCapaActionRequestSchema,
  CompleteCapaActionRequestSchema,
  CapaCaseListQuerySchema,
  CapaCaseListResponseSchema,
  CapaCaseDetailResponseSchema,
  SpcStatusSchema,
  SpcSignalReasonSchema,
  SpcPChartFilterSchema,
  SpcBaselineSchema,
  SpcSummarySchema,
  SpcPChartPointSchema,
  SpcPChartResponseSchema,
  ReportTypeSchema,
  ExportFormatSchema,
  BaseReportFilterSchema,
  ProductionPerformanceFilterSchema,
  InspectionSummaryFilterSchema,
  DefectAnalysisFilterSchema,
  CapaStatusFilterSchema,
  SpcSummaryReportFilterSchema,
  CreateScheduledReportSchema,
  UpdateScheduledReportSchema,
  ScheduledReportResponseSchema,
  ReportRunResponseSchema,
  AlertRuleTypeSchema,
  AlertSeveritySchema,
  AlertStatusSchema,
  OperationalAlertSchema,
  AlertListFilterSchema,
  ResolveAlertSchema,
  AlertEvaluationResultSchema,
  NotificationSeveritySchema,
  NotificationChannelSchema,
  NotificationEntityTypeSchema,
  NotificationResponseSchema,
  NotificationListFilterSchema,
  NotificationListResponseSchema,
  EmailDeliveryStatusSchema,
  EmailDeliveryResponseSchema,
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

  describe('Phase 8 — CAPA Management Contracts', () => {
    it('validates a valid CreateCapaCaseRequest with defaults', () => {
      const res = CreateCapaCaseRequestSchema.safeParse({
        title: 'Porosity in Engine Block Casting',
        description:
          'Multiple casting defects found during final machining exceeding acceptable porosity limits.',
        source: 'INSPECTION_FAILURE',
        defectRecordId: '33333333-3333-3333-3333-333333333333',
        dueDate: '2026-11-15',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.priority).toBe('MEDIUM');
      }
    });

    it('rejects invalid CreateCapaCaseRequest inputs', () => {
      // Short title
      const shortTitle = CreateCapaCaseRequestSchema.safeParse({
        title: 'AB',
        description: 'Valid description here',
        source: 'INTERNAL_AUDIT',
      });
      expect(shortTitle.success).toBe(false);

      // Invalid source
      const badSource = CreateCapaCaseRequestSchema.safeParse({
        title: 'Valid Title Here',
        description: 'Valid description here',
        source: 'NOT_A_REAL_SOURCE',
      });
      expect(badSource.success).toBe(false);

      // Invalid date format
      const badDate = CreateCapaCaseRequestSchema.safeParse({
        title: 'Valid Title Here',
        description: 'Valid description here',
        source: 'CUSTOMER_COMPLAINT',
        dueDate: '15/11/2026',
      });
      expect(badDate.success).toBe(false);
    });

    it('validates UpdateCapaCaseRequest and rejects short changeReason', () => {
      const validUpdate = UpdateCapaCaseRequestSchema.safeParse({
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        changeReason: 'Escalated priority due to repeat defect occurrence in lot #4',
      });
      expect(validUpdate.success).toBe(true);

      const invalidUpdate = UpdateCapaCaseRequestSchema.safeParse({
        priority: 'CRITICAL',
        changeReason: 'bad',
      });
      expect(invalidUpdate.success).toBe(false);
    });

    it('validates VerifyCapaCaseRequestSchema outcomes and notes', () => {
      const validPass = VerifyCapaCaseRequestSchema.safeParse({
        result: 'PASS',
        notes: 'Tooling replacement inspected, verified 0 porosity across 5 sample batches.',
      });
      expect(validPass.success).toBe(true);

      const invalidResult = VerifyCapaCaseRequestSchema.safeParse({
        result: 'MAYBE',
        notes: 'Valid notes text here',
      });
      expect(invalidResult.success).toBe(false);

      const shortNotes = VerifyCapaCaseRequestSchema.safeParse({
        result: 'FAIL',
        notes: 'No',
      });
      expect(shortNotes.success).toBe(false);
    });

    it('validates CreateCapaActionRequestSchema and CompleteCapaActionRequestSchema', () => {
      const actionRes = CreateCapaActionRequestSchema.safeParse({
        actionType: 'IMMEDIATE_CONTAINMENT',
        description: 'Quarantine existing WIP inventory on line 2 for ultrasonic inspection.',
        dueDate: '2026-10-30',
      });
      expect(actionRes.success).toBe(true);

      const completeRes = CompleteCapaActionRequestSchema.safeParse({
        completionNotes: 'Quarantine completed. 150 units isolated; 3 rejected units tagged.',
      });
      expect(completeRes.success).toBe(true);

      const shortComplete = CompleteCapaActionRequestSchema.safeParse({
        completionNotes: 'Done',
      });
      expect(shortComplete.success).toBe(false);
    });

    it('validates CapaCaseListQuerySchema transformations', () => {
      const query = CapaCaseListQuerySchema.safeParse({
        page: '2',
        limit: '15',
        overdue: 'true',
        priority: 'HIGH',
        status: 'UNDER_REVIEW',
      });
      expect(query.success).toBe(true);
      if (query.success) {
        expect(query.data.page).toBe(2);
        expect(query.data.limit).toBe(15);
        expect(query.data.overdue).toBe(true);
        expect(query.data.priority).toBe('HIGH');
        expect(query.data.status).toBe('UNDER_REVIEW');
      }
    });

    it('validates complete CapaCaseSchema serialization', () => {
      const capaCase = CapaCaseSchema.safeParse({
        id: '44444444-4444-4444-4444-444444444444',
        caseNumber: 'CAPA-2026-0001',
        title: 'Porosity in Engine Block Casting',
        description: 'Detailed problem statement here.',
        source: 'INSPECTION_FAILURE',
        priority: 'HIGH',
        status: 'CLOSED',
        batchId: '11111111-1111-1111-1111-111111111111',
        batchNumber: 'BATCH-2026-001',
        defectRecordId: '22222222-2222-2222-2222-222222222222',
        defectCode: 'DEF-POR-01',
        defectName: 'Surface Porosity',
        defectSeverity: 'CRITICAL',
        inspectionId: '33333333-3333-3333-3333-333333333333',
        inspectionNumber: 'INSP-2026-0001',
        assignedTo: '55555555-5555-5555-5555-555555555555',
        assignedToName: 'John Doe',
        assignedToUsername: 'johndoe',
        createdBy: '66666666-6666-6666-6666-666666666666',
        createdByName: 'Jane Smith',
        dueDate: '2026-11-01',
        rootCause: 'Improper mold degassing procedure observed during morning shift.',
        verifiedBy: '77777777-7777-7777-7777-777777777777',
        verifiedByName: 'Quality Manager',
        verifiedAt: '2026-10-25T14:30:00.000Z',
        verificationNotes: 'Verification audit confirmed 0 defects across 3 consecutive batches.',
        actionCount: 2,
        completedActionCount: 2,
        isOverdue: false,
        createdAt: '2026-10-20T08:00:00.000Z',
        updatedAt: '2026-10-25T14:30:00.000Z',
      });
      expect(capaCase.success).toBe(true);
    });

    it('validates Phase 8 enum and detail response schemas', () => {
      expect(CapaSourceSchema.safeParse('INSPECTION_FAILURE').success).toBe(true);
      expect(CapaStatusSchema.safeParse('OPEN').success).toBe(true);
      expect(CapaPrioritySchema.safeParse('HIGH').success).toBe(true);
      expect(CapaActionTypeSchema.safeParse('CORRECTIVE').success).toBe(true);
      expect(CapaActionStatusSchema.safeParse('PENDING').success).toBe(true);

      const action = CapaActionSchema.safeParse({
        id: '12345678-1234-1234-1234-123456789012',
        capaCaseId: '44444444-4444-4444-4444-444444444444',
        actionType: 'CORRECTIVE',
        description: 'Implement automated degassing purge sequence',
        status: 'PENDING',
        assignedTo: null,
        assignedToName: null,
        dueDate: '2026-11-10',
        completedAt: null,
        completionNotes: null,
        createdAt: '2026-10-26T00:00:00.000Z',
        updatedAt: '2026-10-26T00:00:00.000Z',
      });
      expect(action.success).toBe(true);

      expect(
        CloseCapaCaseRequestSchema.safeParse({ closureNotes: 'Verified resolved' }).success,
      ).toBe(true);
      expect(UpdateCapaActionRequestSchema.safeParse({ status: 'IN_PROGRESS' }).success).toBe(true);

      const listRes = CapaCaseListResponseSchema.safeParse({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(listRes.success).toBe(true);

      const caseData = CapaCaseSchema.parse({
        id: '44444444-4444-4444-4444-444444444444',
        caseNumber: 'CAPA-2026-0001',
        title: 'Porosity in Engine Block Casting',
        description: 'Detailed problem statement here.',
        source: 'INSPECTION_FAILURE',
        priority: 'HIGH',
        status: 'OPEN',
        createdBy: '66666666-6666-6666-6666-666666666666',
        actionCount: 0,
        completedActionCount: 0,
        isOverdue: false,
        createdAt: '2026-10-20T08:00:00.000Z',
        updatedAt: '2026-10-25T14:30:00.000Z',
      });

      const detailRes = CapaCaseDetailResponseSchema.safeParse({
        case: caseData,
        actions: [],
      });
      expect(detailRes.success).toBe(true);
    });

    describe('Phase 9 — Statistical Process Monitoring (SPC) Schemas', () => {
      it('validates SpcStatusSchema and SpcSignalReasonSchema values', () => {
        expect(SpcStatusSchema.safeParse('READY').success).toBe(true);
        expect(SpcStatusSchema.safeParse('INSUFFICIENT_DATA').success).toBe(true);
        expect(SpcStatusSchema.safeParse('DEGENERATE_BASELINE').success).toBe(true);
        expect(SpcStatusSchema.safeParse('UNKNOWN').success).toBe(false);

        expect(SpcSignalReasonSchema.safeParse('ABOVE_UCL').success).toBe(true);
        expect(SpcSignalReasonSchema.safeParse('BELOW_LCL').success).toBe(true);
        expect(SpcSignalReasonSchema.safeParse(null).success).toBe(true);
        expect(SpcSignalReasonSchema.safeParse('INVALID').success).toBe(false);
      });

      it('validates SpcPChartFilterSchema with valid bounds', () => {
        const valid = SpcPChartFilterSchema.safeParse({
          productId: '11111111-1111-1111-1111-111111111111',
          productionLineId: '22222222-2222-2222-2222-222222222222',
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-03-31T23:59:59.000Z',
          shiftId: '33333333-3333-3333-3333-333333333333',
          inspectionStage: 'FINAL',
        });
        expect(valid.success).toBe(true);
      });

      it('rejects SpcPChartFilterSchema when from is after to', () => {
        const reversed = SpcPChartFilterSchema.safeParse({
          productId: '11111111-1111-1111-1111-111111111111',
          productionLineId: '22222222-2222-2222-2222-222222222222',
          from: '2026-06-01T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
        });
        expect(reversed.success).toBe(false);
        if (!reversed.success) {
          expect(reversed.error.issues[0]?.message).toContain('must not be after');
        }
      });

      it('rejects SpcPChartFilterSchema when window exceeds 366 days', () => {
        const tooLong = SpcPChartFilterSchema.safeParse({
          productId: '11111111-1111-1111-1111-111111111111',
          productionLineId: '22222222-2222-2222-2222-222222222222',
          from: '2024-01-01T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
        });
        expect(tooLong.success).toBe(false);
        if (!tooLong.success) {
          expect(tooLong.error.issues[0]?.message).toContain('cannot exceed 366 days');
        }
      });

      it('validates complete SpcPChartResponseSchema payload', () => {
        const sampleResponse = {
          status: 'READY',
          filters: {
            productId: '11111111-1111-1111-1111-111111111111',
            productCode: 'PRD-01',
            productName: 'Transmission Gear',
            productionLineId: '22222222-2222-2222-2222-222222222222',
            productionLineName: 'Line 1',
            from: '2026-01-01T00:00:00.000Z',
            to: '2026-03-31T00:00:00.000Z',
          },
          baseline: {
            subgroupCount: 20,
            minimumRequired: 20,
            totalSampleSize: 1000,
            totalFailedUnits: 40,
            pBar: 0.04,
          },
          summary: {
            signalCount: 1,
            upperSignalCount: 1,
            lowerSignalCount: 0,
            interpretation: '1 subgroup outside control limits.',
          },
          points: [
            {
              inspectionId: '44444444-4444-4444-4444-444444444444',
              inspectionNumber: 'INSP-2026-0001',
              batchId: '55555555-5555-5555-5555-555555555555',
              batchNumber: 'BATCH-001',
              timestamp: '2026-01-02T08:00:00.000Z',
              sampleSize: 50,
              failedUnits: 6,
              observedProportion: 0.12,
              centerLine: 0.04,
              upperControlLimit: 0.123,
              lowerControlLimit: 0.0,
              signal: false,
              signalReason: null,
            },
          ],
          warnings: [],
        };

        const parsed = SpcPChartResponseSchema.safeParse(sampleResponse);
        expect(parsed.success).toBe(true);

        const pointParsed = SpcPChartPointSchema.safeParse(sampleResponse.points[0]);
        expect(pointParsed.success).toBe(true);

        const baselineParsed = SpcBaselineSchema.safeParse(sampleResponse.baseline);
        expect(baselineParsed.success).toBe(true);

        const summaryParsed = SpcSummarySchema.safeParse(sampleResponse.summary);
        expect(summaryParsed.success).toBe(true);
      });
    });
  });

  describe('Contracts — Phase 10 Reporting, Exports & Operational Alerts Schemas', () => {
    describe('Report Filters & Base Validation', () => {
      it('validates BaseReportFilterSchema chronological order and max 366-day window', () => {
        // Valid 30-day window
        const valid = {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-31T00:00:00.000Z',
        };
        expect(BaseReportFilterSchema.safeParse(valid).success).toBe(true);

        // Invalid: from > to
        const inverted = {
          from: '2026-02-01T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
        };
        expect(BaseReportFilterSchema.safeParse(inverted).success).toBe(false);

        expect(ReportTypeSchema.safeParse('production-performance').success).toBe(true);
        expect(ReportTypeSchema.safeParse('invalid-report').success).toBe(false);
        expect(ExportFormatSchema.safeParse('CSV').success).toBe(true);
        expect(ExportFormatSchema.safeParse('XML').success).toBe(false);

        // Invalid: exceeds 366 days
        const tooLong = {
          from: '2025-01-01T00:00:00.000Z',
          to: '2026-02-01T00:00:00.000Z',
        };
        expect(BaseReportFilterSchema.safeParse(tooLong).success).toBe(false);

        // Invalid date format
        expect(
          BaseReportFilterSchema.safeParse({ from: 'not-a-date', to: '2026-01-01' }).success,
        ).toBe(false);
      });

      it('validates report-specific filter schemas', () => {
        const base = {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-31T00:00:00.000Z',
        };

        // ProductionPerformanceFilterSchema
        expect(
          ProductionPerformanceFilterSchema.safeParse({
            ...base,
            productId: '11111111-1111-1111-1111-111111111111',
            status: 'COMPLETED',
          }).success,
        ).toBe(true);

        // InspectionSummaryFilterSchema
        expect(
          InspectionSummaryFilterSchema.safeParse({
            ...base,
            stage: 'FINAL',
            result: 'PASS',
          }).success,
        ).toBe(true);

        // DefectAnalysisFilterSchema
        expect(
          DefectAnalysisFilterSchema.safeParse({
            ...base,
            severity: 'CRITICAL',
          }).success,
        ).toBe(true);

        // CapaStatusFilterSchema
        expect(
          CapaStatusFilterSchema.safeParse({
            ...base,
            priority: 'HIGH',
            status: 'UNDER_REVIEW',
          }).success,
        ).toBe(true);

        // SpcSummaryReportFilterSchema requires productId and productionLineId
        expect(
          SpcSummaryReportFilterSchema.safeParse({
            ...base,
            productId: '11111111-1111-1111-1111-111111111111',
            productionLineId: '22222222-2222-2222-2222-222222222222',
          }).success,
        ).toBe(true);

        expect(
          SpcSummaryReportFilterSchema.safeParse({
            ...base,
          }).success,
        ).toBe(false);
      });
    });

    describe('Scheduled Report Contracts', () => {
      it('validates CreateScheduledReportSchema and UpdateScheduledReportSchema', () => {
        const validCreate = {
          name: 'Weekly Quality Summary',
          reportType: 'inspection-summary',
          filters: { stage: 'FINAL' },
          format: 'PDF',
          cadence: 'WEEKLY',
          timezone: 'America/New_York',
          isEnabled: true,
        };
        expect(CreateScheduledReportSchema.safeParse(validCreate).success).toBe(true);

        // Invalid cadence
        expect(
          CreateScheduledReportSchema.safeParse({
            ...validCreate,
            cadence: 'BIWEEKLY',
          }).success,
        ).toBe(false);

        // Valid update
        expect(
          UpdateScheduledReportSchema.safeParse({
            isEnabled: false,
            cadence: 'MONTHLY',
          }).success,
        ).toBe(true);
      });

      it('validates ScheduledReportResponseSchema and ReportRunResponseSchema', () => {
        const scheduleResponse = {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Daily Production Summary',
          reportType: 'production-performance',
          filters: {},
          format: 'CSV',
          cadence: 'DAILY',
          timezone: 'UTC',
          isEnabled: true,
          createdBy: '22222222-2222-2222-2222-222222222222',
          nextRunAt: new Date().toISOString(),
          lastRunAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        expect(ScheduledReportResponseSchema.safeParse(scheduleResponse).success).toBe(true);

        const runResponse = {
          id: '33333333-3333-3333-3333-333333333333',
          scheduledReportId: scheduleResponse.id,
          reportType: 'production-performance',
          format: 'CSV',
          filters: {},
          status: 'SUCCEEDED',
          artifactId: '44444444-4444-4444-4444-444444444444',
          fileSizeBytes: 1024,
          errorMessage: null,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          triggeredBy: null,
          createdAt: new Date().toISOString(),
        };
        expect(ReportRunResponseSchema.safeParse(runResponse).success).toBe(true);
      });
    });

    describe('Operational Alert Contracts', () => {
      it('validates AlertRuleType, AlertSeverity, and AlertStatus enums', () => {
        expect(AlertRuleTypeSchema.safeParse('HIGH_INSPECTION_FAILURE_RATE').success).toBe(true);
        expect(AlertRuleTypeSchema.safeParse('OVERDUE_CAPA').success).toBe(true);
        expect(AlertRuleTypeSchema.safeParse('SPC_OUT_OF_CONTROL').success).toBe(true);
        expect(AlertRuleTypeSchema.safeParse('INVALID_RULE').success).toBe(false);

        expect(AlertSeveritySchema.safeParse('CRITICAL').success).toBe(true);
        expect(AlertSeveritySchema.safeParse('LOW').success).toBe(true);
        expect(AlertSeveritySchema.safeParse('URGENT').success).toBe(false);

        expect(AlertStatusSchema.safeParse('OPEN').success).toBe(true);
        expect(AlertStatusSchema.safeParse('ACKNOWLEDGED').success).toBe(true);
        expect(AlertStatusSchema.safeParse('RESOLVED').success).toBe(true);
        expect(AlertStatusSchema.safeParse('CLOSED').success).toBe(false);
      });

      it('validates OperationalAlertSchema and ResolveAlertSchema', () => {
        const alert = {
          id: '11111111-1111-1111-1111-111111111111',
          ruleType: 'HIGH_INSPECTION_FAILURE_RATE',
          severity: 'HIGH',
          status: 'OPEN',
          title: 'High Inspection Failure Rate on Line 1',
          message: 'Inspection INSP-001 had 25.0% failure rate exceeding threshold 15.0%',
          fingerprint: 'high_failure:insp-001',
          entityType: 'QUALITY_INSPECTION',
          entityId: '22222222-2222-2222-2222-222222222222',
          contextData: { sampleSize: 100, failedUnits: 25, failureRate: 0.25 },
          acknowledgedBy: null,
          acknowledgedAt: null,
          resolvedBy: null,
          resolvedAt: null,
          resolutionNotes: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        expect(OperationalAlertSchema.safeParse(alert).success).toBe(true);

        // Resolve validation requires notes
        expect(
          ResolveAlertSchema.safeParse({
            resolutionNotes: 'Root cause investigated and line re-calibrated.',
          }).success,
        ).toBe(true);
        expect(ResolveAlertSchema.safeParse({ resolutionNotes: '' }).success).toBe(false);
      });

      it('validates AlertListFilterSchema defaults and constraints', () => {
        const parsed = AlertListFilterSchema.safeParse({});
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(parsed.data.limit).toBe(50);
          expect(parsed.data.offset).toBe(0);
        }

        const filtered = AlertListFilterSchema.safeParse({
          status: 'OPEN',
          ruleType: 'OVERDUE_CAPA',
          limit: 25,
          offset: 10,
        });
        expect(filtered.success).toBe(true);
      });

      it('validates AlertEvaluationResultSchema structure', () => {
        const result = {
          evaluatedRules: 3,
          alertsGenerated: 2,
          alertsSkipped: 5,
          errors: [],
        };
        expect(AlertEvaluationResultSchema.safeParse(result).success).toBe(true);
      });
    });

    describe('12. Notification & Email Delivery Contracts', () => {
      it('validates notification enums and channel values', () => {
        expect(NotificationSeveritySchema.safeParse('CRITICAL').success).toBe(true);
        expect(NotificationSeveritySchema.safeParse('INVALID').success).toBe(false);
        expect(NotificationChannelSchema.safeParse('IN_APP').success).toBe(true);
        expect(NotificationChannelSchema.safeParse('EMAIL').success).toBe(true);
        expect(NotificationChannelSchema.safeParse('WEBHOOK').success).toBe(false);
        expect(NotificationEntityTypeSchema.safeParse('OPERATIONAL_ALERT').success).toBe(true);
        expect(NotificationEntityTypeSchema.safeParse('REPORT_RUN').success).toBe(true);
      });

      it('validates NotificationResponseSchema', () => {
        const valid = {
          id: '11111111-1111-1111-1111-111111111111',
          userId: '22222222-2222-2222-2222-222222222222',
          title: 'High Inspection Failure Rate Alert',
          message: 'Inspection #INS-001 has 35% failure rate',
          severity: 'CRITICAL',
          channel: 'IN_APP',
          entityType: 'OPERATIONAL_ALERT',
          entityId: '33333333-3333-3333-3333-333333333333',
          metadata: { failureRate: 0.35 },
          readAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        expect(NotificationResponseSchema.safeParse(valid).success).toBe(true);
      });

      it('validates NotificationListFilterSchema and default pagination', () => {
        const parsed = NotificationListFilterSchema.safeParse({});
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(parsed.data.limit).toBe(20);
          expect(parsed.data.offset).toBe(0);
          expect(parsed.data.unreadOnly).toBeUndefined();
        }

        const unreadFilter = NotificationListFilterSchema.safeParse({ unreadOnly: 'true' });
        expect(unreadFilter.success).toBe(true);
        if (unreadFilter.success) {
          expect(unreadFilter.data.unreadOnly).toBe(true);
        }
      });

      it('validates NotificationListResponseSchema', () => {
        const response = {
          notifications: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              userId: '22222222-2222-2222-2222-222222222222',
              title: 'Test Notification',
              message: 'Test message',
              severity: 'INFO',
              channel: 'IN_APP',
              entityType: null,
              entityId: null,
              metadata: {},
              readAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          total: 1,
          unreadCount: 1,
          limit: 20,
          offset: 0,
        };

        expect(NotificationListResponseSchema.safeParse(response).success).toBe(true);
      });

      it('validates EmailDeliveryStatusSchema and EmailDeliveryResponseSchema', () => {
        expect(EmailDeliveryStatusSchema.safeParse('PENDING').success).toBe(true);
        expect(EmailDeliveryStatusSchema.safeParse('SENT').success).toBe(true);
        expect(EmailDeliveryStatusSchema.safeParse('FAILED').success).toBe(true);

        const emailDelivery = {
          id: '55555555-5555-5555-5555-555555555555',
          notificationId: null,
          recipientEmail: 'quality.lead@company.local',
          recipientUserId: '22222222-2222-2222-2222-222222222222',
          subject: 'Weekly Inspection Report',
          bodyText: 'Please find attached the weekly report.',
          status: 'PENDING',
          attemptCount: 0,
          maxAttempts: 3,
          nextAttemptAt: new Date().toISOString(),
          sentAt: null,
          lastError: null,
          artifactId: '44444444-4444-4444-4444-444444444444',
          reportRunId: '33333333-3333-3333-3333-333333333333',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        expect(EmailDeliveryResponseSchema.safeParse(emailDelivery).success).toBe(true);
      });

      it('validates CreateScheduledReportSchema with optional recipients', () => {
        const createWithRecipients = {
          name: 'Weekly Quality Summary',
          reportType: 'inspection-summary',
          filters: {},
          format: 'PDF',
          cadence: 'WEEKLY',
          recipients: ['manager@factory.local', 'lead@factory.local'],
        };
        const parsed = CreateScheduledReportSchema.safeParse(createWithRecipients);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(parsed.data.recipients).toEqual(['manager@factory.local', 'lead@factory.local']);
        }
      });
    });
  });
});
