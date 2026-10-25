import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { PoolClient } from 'pg';
import { createApp } from '../app.js';
import { pool } from '../infrastructure/database/pool.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { TokenService } from '../infrastructure/security/token.service.js';
import { inspectionsRepository } from '../modules/quality/inspections/inspections.repository.js';
import { defectTypesRepository } from '../modules/master-data/defect-types/defect-types.repository.js';
import { defectsRepository } from '../modules/quality/defects/defects.repository.js';
import { auditService } from '../modules/audit/audit.service.js';
import type { DefectRecord, QualityInspection } from '@qualityops/contracts';

describe('Defect Management & Analytics API (/api/v1/quality/defects)', () => {
  const app = createApp();

  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  } as unknown as PoolClient;

  // 6 canonical test users
  const adminUser = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'admin_user',
    email: 'admin@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'System Admin',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['ADMIN' as const],
  };

  const qmUser = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'qm_user',
    email: 'qm@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Quality Manager',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['QUALITY_MANAGER' as const],
  };

  const supervisorUser = {
    id: '33333333-3333-3333-3333-333333333333',
    username: 'sup_user',
    email: 'supervisor@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Shift Supervisor',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['SUPERVISOR' as const],
  };

  const inspectorUser = {
    id: '44444444-4444-4444-4444-444444444444',
    username: 'insp_user',
    email: 'inspector@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'QA Inspector',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['INSPECTOR' as const],
  };

  const operatorUser = {
    id: '55555555-5555-5555-5555-555555555555',
    username: 'op_user',
    email: 'operator@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Line Operator',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['OPERATOR' as const],
  };

  const viewerUser = {
    id: '66666666-6666-6666-6666-666666666666',
    username: 'viewer_user',
    email: 'viewer@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Auditor Viewer',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['VIEWER' as const],
  };

  const adminToken = TokenService.signAccessToken({
    userId: adminUser.id,
    username: adminUser.username,
    roles: adminUser.roles,
  }).token;

  const qmToken = TokenService.signAccessToken({
    userId: qmUser.id,
    username: qmUser.username,
    roles: qmUser.roles,
  }).token;

  const supervisorToken = TokenService.signAccessToken({
    userId: supervisorUser.id,
    username: supervisorUser.username,
    roles: supervisorUser.roles,
  }).token;

  const inspectorToken = TokenService.signAccessToken({
    userId: inspectorUser.id,
    username: inspectorUser.username,
    roles: inspectorUser.roles,
  }).token;

  const operatorToken = TokenService.signAccessToken({
    userId: operatorUser.id,
    username: operatorUser.username,
    roles: operatorUser.roles,
  }).token;

  const viewerToken = TokenService.signAccessToken({
    userId: viewerUser.id,
    username: viewerUser.username,
    roles: viewerUser.roles,
  }).token;

  const mockInspection: QualityInspection = {
    id: '77777777-7777-7777-7777-777777777777',
    inspectionNumber: 'INSP-20261026-0001',
    batchId: 'b1111111-1111-1111-1111-111111111111',
    inspectorId: inspectorUser.id,
    stage: 'FINAL',
    attemptNumber: 1,
    status: 'COMPLETED',
    result: 'FAIL',
    sampleSize: 10,
    passedUnits: 8,
    failedUnits: 2,
    inspectedAt: '2026-10-26T10:00:00.000Z',
    notes: '2 units failed dimension check',
    createdAt: '2026-10-26T10:00:00.000Z',
    updatedAt: '2026-10-26T10:00:00.000Z',
    batchNumber: 'BATCH-2026-100',
    productCode: 'PRD-001',
    productName: 'Precision Gearbox',
    inspectorUsername: inspectorUser.username,
    inspectorFullName: inspectorUser.full_name,
  };

  const mockDefectType = {
    id: '88888888-8888-8888-8888-888888888888',
    code: 'DEF-001',
    name: 'Surface Scratch',
    category: 'SURFACE',
    severity: 'MINOR' as const,
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
  };

  const mockDefectRecord: DefectRecord = {
    id: '99999999-9999-9999-9999-999999999999',
    inspectionId: mockInspection.id,
    defectTypeId: mockDefectType.id,
    occurrenceCount: 3,
    affectedUnitCount: 2,
    notes: 'Micro-scratches on gear flank',
    createdAt: '2026-10-26T10:05:00.000Z',
    updatedAt: '2026-10-26T10:05:00.000Z',
    defectTypeCode: mockDefectType.code,
    defectTypeName: mockDefectType.name,
    defectTypeCategory: mockDefectType.category,
    defectTypeSeverity: mockDefectType.severity,
    inspectionNumber: mockInspection.inspectionNumber,
    inspectionStage: mockInspection.stage,
    batchId: mockInspection.batchId,
    batchNumber: mockInspection.batchNumber,
    productCode: 'PRD-001',
    productName: 'Precision Gearbox',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);
    vi.spyOn(auditService, 'record').mockResolvedValue();
  });

  describe('Authentication Gateways', () => {
    it('returns 401 Unauthorized for unauthenticated GET /api/v1/quality/defects', async () => {
      const res = await request(app).get('/api/v1/quality/defects');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 Unauthorized for unauthenticated GET /api/v1/quality/defects/analytics', async () => {
      const res = await request(app).get('/api/v1/quality/defects/analytics');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 Unauthorized for unauthenticated GET /api/v1/quality/defects/:id', async () => {
      const res = await request(app).get(`/api/v1/quality/defects/${mockDefectRecord.id}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 Unauthorized for unauthenticated POST /api/v1/quality/defects', async () => {
      const res = await request(app).post('/api/v1/quality/defects').send({});
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 Unauthorized for unauthenticated PATCH /api/v1/quality/defects/:id', async () => {
      const res = await request(app)
        .patch(`/api/v1/quality/defects/${mockDefectRecord.id}`)
        .send({ occurrenceCount: 2, reasonForCorrection: 'Test' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('RBAC Authorization', () => {
    it('allows read access for all 6 canonical roles', async () => {
      const rolesWithTokens = [
        { user: adminUser, token: adminToken },
        { user: qmUser, token: qmToken },
        { user: supervisorUser, token: supervisorToken },
        { user: inspectorUser, token: inspectorToken },
        { user: operatorUser, token: operatorToken },
        { user: viewerUser, token: viewerToken },
      ];

      vi.spyOn(defectsRepository, 'list').mockResolvedValue({
        items: [mockDefectRecord],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      for (const { user, token } of rolesWithTokens) {
        vi.spyOn(authRepository, 'findById').mockResolvedValue(user);
        const res = await request(app)
          .get('/api/v1/quality/defects')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.items).toHaveLength(1);
      }
    });

    it('allows INSPECTOR to create defect finding', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue(mockInspection);
      vi.spyOn(defectTypesRepository, 'findById').mockResolvedValue(mockDefectType);
      vi.spyOn(defectsRepository, 'findByInspectionAndDefectType').mockResolvedValue(null);
      vi.spyOn(defectsRepository, 'create').mockResolvedValue(mockDefectRecord);

      const res = await request(app)
        .post('/api/v1/quality/defects')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          inspectionId: mockInspection.id,
          defectTypeId: mockDefectType.id,
          occurrenceCount: 3,
          affectedUnitCount: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.item.id).toBe(mockDefectRecord.id);
    });

    it('denies creation for SUPERVISOR, OPERATOR, and VIEWER (403 Forbidden)', async () => {
      const forbiddenRoles = [
        { user: supervisorUser, token: supervisorToken },
        { user: operatorUser, token: operatorToken },
        { user: viewerUser, token: viewerToken },
      ];

      for (const { user, token } of forbiddenRoles) {
        vi.spyOn(authRepository, 'findById').mockResolvedValue(user);
        const res = await request(app)
          .post('/api/v1/quality/defects')
          .set('Authorization', `Bearer ${token}`)
          .send({
            inspectionId: mockInspection.id,
            defectTypeId: mockDefectType.id,
            occurrenceCount: 3,
            affectedUnitCount: 2,
          });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });

    it('allows ADMIN and QUALITY_MANAGER to perform corrections (PATCH)', async () => {
      const allowedRoles = [
        { user: adminUser, token: adminToken },
        { user: qmUser, token: qmToken },
      ];

      vi.spyOn(defectsRepository, 'findById').mockResolvedValue(mockDefectRecord);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue(mockInspection);
      vi.spyOn(defectsRepository, 'update').mockResolvedValue({
        ...mockDefectRecord,
        occurrenceCount: 4,
      });

      for (const { user, token } of allowedRoles) {
        vi.spyOn(authRepository, 'findById').mockResolvedValue(user);
        const res = await request(app)
          .patch(`/api/v1/quality/defects/${mockDefectRecord.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            occurrenceCount: 4,
            reasonForCorrection: 'Recalculated occurrences after microscopic inspection',
          });

        expect(res.status).toBe(200);
        expect(res.body.item.occurrenceCount).toBe(4);
      }
    });

    it('denies correction (PATCH) for INSPECTOR, OPERATOR, VIEWER, SUPERVISOR (403 Forbidden)', async () => {
      const forbiddenRoles = [
        { user: inspectorUser, token: inspectorToken },
        { user: operatorUser, token: operatorToken },
        { user: viewerUser, token: viewerToken },
        { user: supervisorUser, token: supervisorToken },
      ];

      for (const { user, token } of forbiddenRoles) {
        vi.spyOn(authRepository, 'findById').mockResolvedValue(user);
        const res = await request(app)
          .patch(`/api/v1/quality/defects/${mockDefectRecord.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            occurrenceCount: 4,
            reasonForCorrection: 'Unauthorized adjustment',
          });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });

    it('strictly forbids DELETE operations on defects (404 Not Found)', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);

      const res = await request(app)
        .delete(`/api/v1/quality/defects/${mockDefectRecord.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Business Rules & Integrity Constraints', () => {
    it('rejects defect creation on CANCELLED inspection', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue({
        ...mockInspection,
        status: 'CANCELLED',
      });

      const res = await request(app)
        .post('/api/v1/quality/defects')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          inspectionId: mockInspection.id,
          defectTypeId: mockDefectType.id,
          occurrenceCount: 2,
          affectedUnitCount: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('cannot be recorded on cancelled inspections');
    });

    it('rejects defect creation on COMPLETED inspection with 0 failed units (clean PASS)', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue({
        ...mockInspection,
        status: 'COMPLETED',
        result: 'PASS',
        failedUnits: 0,
      });

      const res = await request(app)
        .post('/api/v1/quality/defects')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          inspectionId: mockInspection.id,
          defectTypeId: mockDefectType.id,
          occurrenceCount: 2,
          affectedUnitCount: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain(
        'cannot be recorded on completed inspections with zero failed units',
      );
    });

    it('rejects when affectedUnitCount > occurrenceCount', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);

      // Caught by Zod contract
      const res = await request(app)
        .post('/api/v1/quality/defects')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          inspectionId: mockInspection.id,
          defectTypeId: mockDefectType.id,
          occurrenceCount: 2,
          affectedUnitCount: 3, // 3 > 2 -> Must fail!
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Validation error');
    });

    it('rejects when affectedUnitCount > inspection.sampleSize', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue({
        ...mockInspection,
        status: 'IN_PROGRESS',
        sampleSize: 5,
      });

      const res = await request(app)
        .post('/api/v1/quality/defects')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          inspectionId: mockInspection.id,
          defectTypeId: mockDefectType.id,
          occurrenceCount: 10,
          affectedUnitCount: 8, // 8 > 5 sample size -> Must fail!
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('cannot exceed the inspection sample size');
    });

    it('rejects when affectedUnitCount > inspection.failedUnits on completed inspection', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue({
        ...mockInspection,
        status: 'COMPLETED',
        sampleSize: 10,
        failedUnits: 2,
      });

      const res = await request(app)
        .post('/api/v1/quality/defects')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          inspectionId: mockInspection.id,
          defectTypeId: mockDefectType.id,
          occurrenceCount: 5,
          affectedUnitCount: 4, // 4 > 2 failed units -> Must fail!
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain(
        'cannot exceed the inspection classified failed units',
      );
    });

    it('rejects inactive defect types', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue(mockInspection);
      vi.spyOn(defectTypesRepository, 'findById').mockResolvedValue({
        ...mockDefectType,
        is_active: false,
      });

      const res = await request(app)
        .post('/api/v1/quality/defects')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          inspectionId: mockInspection.id,
          defectTypeId: mockDefectType.id,
          occurrenceCount: 2,
          affectedUnitCount: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('is inactive and cannot be selected');
    });

    it('rejects duplicate defect type on the same inspection with 409 Conflict', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue(mockInspection);
      vi.spyOn(defectTypesRepository, 'findById').mockResolvedValue(mockDefectType);
      vi.spyOn(defectsRepository, 'findByInspectionAndDefectType').mockResolvedValue(
        mockDefectRecord,
      );

      const res = await request(app)
        .post('/api/v1/quality/defects')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          inspectionId: mockInspection.id,
          defectTypeId: mockDefectType.id,
          occurrenceCount: 2,
          affectedUnitCount: 1,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('rejects correction without a non-empty reasonForCorrection', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);

      const res = await request(app)
        .patch(`/api/v1/quality/defects/${mockDefectRecord.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          occurrenceCount: 5,
          reasonForCorrection: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Validation error');
    });
  });

  describe('Audit Logging Verification', () => {
    it('audits CREATE action on defect finding creation with actorId', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue(mockInspection);
      vi.spyOn(defectTypesRepository, 'findById').mockResolvedValue(mockDefectType);
      vi.spyOn(defectsRepository, 'findByInspectionAndDefectType').mockResolvedValue(null);
      vi.spyOn(defectsRepository, 'create').mockResolvedValue(mockDefectRecord);
      const auditSpy = vi.spyOn(auditService, 'record').mockResolvedValue();

      const res = await request(app)
        .post('/api/v1/quality/defects')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          inspectionId: mockInspection.id,
          defectTypeId: mockDefectType.id,
          occurrenceCount: 3,
          affectedUnitCount: 2,
        });

      expect(res.status).toBe(201);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'DEFECT_RECORD',
          actorId: inspectorUser.id,
          entityId: mockDefectRecord.id,
        }),
      );
    });

    it('audits CORRECTION action on defect patch with before and after state', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(qmUser);
      vi.spyOn(defectsRepository, 'findById').mockResolvedValue(mockDefectRecord);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue(mockInspection);
      vi.spyOn(defectsRepository, 'update').mockResolvedValue({
        ...mockDefectRecord,
        notes: 'Updated notes',
      });
      const auditSpy = vi.spyOn(auditService, 'record').mockResolvedValue();

      const res = await request(app)
        .patch(`/api/v1/quality/defects/${mockDefectRecord.id}`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({
          notes: 'Updated notes',
          reasonForCorrection: 'Correction of observations log',
        });

      expect(res.status).toBe(200);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CORRECTION',
          entityType: 'DEFECT_RECORD',
          actorId: qmUser.id,
          entityId: mockDefectRecord.id,
          beforeState: expect.anything(),
          afterState: expect.objectContaining({
            reasonForCorrection: 'Correction of observations log',
          }),
        }),
      );
    });
  });

  describe('Descriptive Analytics Endpoint', () => {
    it('returns aggregated analytics metrics from PostgreSQL repository', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(viewerUser);
      const mockAnalytics = {
        overview: {
          totalFindings: 5,
          totalOccurrences: 14,
          totalAffectedUnitsAcrossFindings: 10,
        },
        byType: [
          {
            defectTypeId: mockDefectType.id,
            code: 'DEF-001',
            name: 'Surface Scratch',
            category: 'SURFACE',
            severity: 'MINOR' as const,
            findingCount: 3,
            occurrenceCount: 8,
            affectedUnitCount: 6,
          },
        ],
        bySeverity: [
          {
            severity: 'MINOR' as const,
            findingCount: 3,
            occurrenceCount: 8,
            affectedUnitCount: 6,
          },
        ],
        byProduct: [],
        byProductionLine: [],
        byMachine: [],
        byShift: [],
        trend: [],
        pareto: [
          {
            defectTypeId: mockDefectType.id,
            code: 'DEF-001',
            name: 'Surface Scratch',
            category: 'SURFACE',
            severity: 'MINOR' as const,
            measure: 'affectedUnitCount' as const,
            value: 6,
            percentage: 60,
            cumulativePercentage: 60,
          },
        ],
      };
      vi.spyOn(defectsRepository, 'getAnalytics').mockResolvedValue(mockAnalytics);

      const res = await request(app)
        .get('/api/v1/quality/defects/analytics?severity=MINOR')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.overview.totalFindings).toBe(5);
      expect(res.body.overview.totalOccurrences).toBe(14);
      expect(res.body.overview.totalAffectedUnitsAcrossFindings).toBe(10);
      expect(res.body.pareto).toHaveLength(1);
    });
  });
});
