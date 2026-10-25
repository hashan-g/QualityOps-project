import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { PoolClient } from 'pg';
import { createApp } from '../app.js';
import { pool } from '../infrastructure/database/pool.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { TokenService } from '../infrastructure/security/token.service.js';
import { batchesRepository } from '../modules/production/batches/batches.repository.js';
import { inspectionsRepository } from '../modules/quality/inspections/inspections.repository.js';
import { auditService } from '../modules/audit/audit.service.js';
import type { QualityInspection } from '@qualityops/contracts';

describe('Quality Inspections API (/api/v1/quality/inspections)', () => {
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
    created_at: new Date('2026-10-25T00:00:00Z'),
    updated_at: new Date('2026-10-25T00:00:00Z'),
    roles: ['ADMIN' as const],
  };

  const qmUser = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'qm_user',
    email: 'qm@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Quality Manager',
    is_active: true,
    created_at: new Date('2026-10-25T00:00:00Z'),
    updated_at: new Date('2026-10-25T00:00:00Z'),
    roles: ['QUALITY_MANAGER' as const],
  };

  const supervisorUser = {
    id: '33333333-3333-3333-3333-333333333333',
    username: 'sup_user',
    email: 'supervisor@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Shift Supervisor',
    is_active: true,
    created_at: new Date('2026-10-25T00:00:00Z'),
    updated_at: new Date('2026-10-25T00:00:00Z'),
    roles: ['SUPERVISOR' as const],
  };

  const inspectorUser = {
    id: '44444444-4444-4444-4444-444444444444',
    username: 'insp_user',
    email: 'inspector@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'QA Inspector',
    is_active: true,
    created_at: new Date('2026-10-25T00:00:00Z'),
    updated_at: new Date('2026-10-25T00:00:00Z'),
    roles: ['INSPECTOR' as const],
  };

  const operatorUser = {
    id: '55555555-5555-5555-5555-555555555555',
    username: 'op_user',
    email: 'operator@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Line Operator',
    is_active: true,
    created_at: new Date('2026-10-25T00:00:00Z'),
    updated_at: new Date('2026-10-25T00:00:00Z'),
    roles: ['OPERATOR' as const],
  };

  const viewerUser = {
    id: '66666666-6666-6666-6666-666666666666',
    username: 'viewer_user',
    email: 'viewer@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Auditor Viewer',
    is_active: true,
    created_at: new Date('2026-10-25T00:00:00Z'),
    updated_at: new Date('2026-10-25T00:00:00Z'),
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

  const mockBatchRow = {
    id: 'b1111111-1111-1111-1111-111111111111',
    batch_number: 'BATCH-2026-100',
    product_id: 'p1111111-1111-1111-1111-111111111111',
    product_code: 'PRD-001',
    product_name: 'Precision Gearbox',
    production_line_id: 'l1111111-1111-1111-1111-111111111111',
    shift_id: 's1111111-1111-1111-1111-111111111111',
    machine_id: null,
    created_by: adminUser.id,
    status: 'IN_PROGRESS' as const,
    planned_quantity: 100,
    produced_quantity: 50,
    accepted_quantity: 45,
    scrap_quantity: 5,
    rework_pending_quantity: 0,
    started_at: new Date('2026-10-25T08:00:00Z'),
    completed_at: null,
    created_at: new Date('2026-10-25T08:00:00Z'),
    updated_at: new Date('2026-10-25T08:00:00Z'),
  };

  const mockInspection: QualityInspection = {
    id: '77777777-7777-7777-7777-777777777777',
    inspectionNumber: 'INSP-20261025-0001',
    batchId: mockBatchRow.id,
    inspectorId: inspectorUser.id,
    stage: 'FINAL',
    attemptNumber: 1,
    status: 'COMPLETED',
    result: 'PASS',
    sampleSize: 10,
    passedUnits: 10,
    failedUnits: 0,
    inspectedAt: '2026-10-25T10:00:00.000Z',
    notes: 'Initial check passed with zero defects',
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
    batchNumber: mockBatchRow.batch_number,
    productCode: 'PRD-001',
    productName: 'Precision Gearbox',
    inspectorUsername: inspectorUser.username,
    inspectorFullName: inspectorUser.full_name,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);
    vi.spyOn(auditService, 'record').mockResolvedValue();
  });

  describe('Authentication Gateways', () => {
    it('returns 401 Unauthorized for unauthenticated GET /api/v1/quality/inspections', async () => {
      const res = await request(app).get('/api/v1/quality/inspections');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 Unauthorized for unauthenticated GET /api/v1/quality/inspections/:id', async () => {
      const res = await request(app).get(`/api/v1/quality/inspections/${mockInspection.id}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 Unauthorized for unauthenticated POST /api/v1/quality/inspections', async () => {
      const res = await request(app).post('/api/v1/quality/inspections').send({});
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 Unauthorized for unauthenticated PATCH /api/v1/quality/inspections/:id', async () => {
      const res = await request(app)
        .patch(`/api/v1/quality/inspections/${mockInspection.id}`)
        .send({ notes: 'Correction' });
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

      vi.spyOn(inspectionsRepository, 'list').mockResolvedValue({
        items: [mockInspection],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      for (const { user, token } of rolesWithTokens) {
        vi.spyOn(authRepository, 'findById').mockResolvedValue(user);
        const res = await request(app)
          .get('/api/v1/quality/inspections')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.items).toHaveLength(1);
      }
    });

    it('allows INSPECTOR to create inspection', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue(mockBatchRow);
      vi.spyOn(inspectionsRepository, 'getNextAttemptNumber').mockResolvedValue(1);
      vi.spyOn(inspectionsRepository, 'findByBatchStageAttempt').mockResolvedValue(null);
      vi.spyOn(inspectionsRepository, 'generateInspectionNumber').mockResolvedValue(
        'INSP-20261025-0001',
      );
      vi.spyOn(inspectionsRepository, 'create').mockResolvedValue(mockInspection);

      const res = await request(app)
        .post('/api/v1/quality/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          batchId: mockBatchRow.id,
          stage: 'FINAL',
          sampleSize: 10,
          passedUnits: 10,
          failedUnits: 0,
        });

      expect(res.status).toBe(201);
      expect(res.body.item.inspectionNumber).toBe('INSP-20261025-0001');
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
          .post('/api/v1/quality/inspections')
          .set('Authorization', `Bearer ${token}`)
          .send({
            batchId: mockBatchRow.id,
            stage: 'FINAL',
            sampleSize: 10,
            passedUnits: 10,
            failedUnits: 0,
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

      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue(mockInspection);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue(mockBatchRow);
      vi.spyOn(inspectionsRepository, 'update').mockResolvedValue({
        ...mockInspection,
        notes: 'Supervisor verified calibration',
      });

      for (const { user, token } of allowedRoles) {
        vi.spyOn(authRepository, 'findById').mockResolvedValue(user);
        const res = await request(app)
          .patch(`/api/v1/quality/inspections/${mockInspection.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            notes: 'Supervisor verified calibration',
            reasonForCorrection: 'Updated notes after recalibration check',
          });

        expect(res.status).toBe(200);
        expect(res.body.item.notes).toBe('Supervisor verified calibration');
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
          .patch(`/api/v1/quality/inspections/${mockInspection.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ notes: 'Unauthorized edit' });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });

    it('strictly forbids DELETE operations on inspections (404/405)', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);

      const res = await request(app)
        .delete(`/api/v1/quality/inspections/${mockInspection.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Since DELETE route is not registered, express returns 404
      expect(res.status).toBe(404);
    });
  });

  describe('Batch Eligibility Constraints', () => {
    it('rejects inspection creation on PLANNED batch', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue({
        ...mockBatchRow,
        status: 'PLANNED',
        produced_quantity: 0,
      });

      const res = await request(app)
        .post('/api/v1/quality/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          batchId: mockBatchRow.id,
          stage: 'FINAL',
          sampleSize: 5,
          passedUnits: 5,
          failedUnits: 0,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain(
        "Inspections cannot be performed on batches with status 'PLANNED'",
      );
    });

    it('rejects inspection creation on CANCELLED batch', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue({
        ...mockBatchRow,
        status: 'CANCELLED',
      });

      const res = await request(app)
        .post('/api/v1/quality/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          batchId: mockBatchRow.id,
          stage: 'FINAL',
          sampleSize: 5,
          passedUnits: 5,
          failedUnits: 0,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain(
        "Inspections cannot be performed on batches with status 'CANCELLED'",
      );
    });

    it('allows inspection creation on ON_HOLD and COMPLETED batches', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(inspectionsRepository, 'getNextAttemptNumber').mockResolvedValue(1);
      vi.spyOn(inspectionsRepository, 'findByBatchStageAttempt').mockResolvedValue(null);
      vi.spyOn(inspectionsRepository, 'generateInspectionNumber').mockResolvedValue(
        'INSP-20261025-0002',
      );
      vi.spyOn(inspectionsRepository, 'create').mockResolvedValue(mockInspection);

      for (const status of ['ON_HOLD', 'COMPLETED'] as const) {
        vi.spyOn(batchesRepository, 'findById').mockResolvedValue({
          ...mockBatchRow,
          status,
          produced_quantity: 50,
        });

        const res = await request(app)
          .post('/api/v1/quality/inspections')
          .set('Authorization', `Bearer ${inspectorToken}`)
          .send({
            batchId: mockBatchRow.id,
            stage: 'RECEIVING',
            sampleSize: 5,
            passedUnits: 5,
            failedUnits: 0,
          });

        expect(res.status).toBe(201);
      }
    });
  });

  describe('Sample Rules & Result Derivation', () => {
    it('rejects when sample size exceeds batch produced quantity', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue({
        ...mockBatchRow,
        produced_quantity: 20,
      });

      const res = await request(app)
        .post('/api/v1/quality/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          batchId: mockBatchRow.id,
          stage: 'FINAL',
          sampleSize: 25, // 25 > 20 produced -> MUST FAIL
          passedUnits: 20,
          failedUnits: 5,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain(
        'cannot exceed the batch recorded produced quantity',
      );
    });

    it('rejects when passed + failed units exceed sample size', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);

      // Caught by Zod runtime contract validation
      const res = await request(app)
        .post('/api/v1/quality/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          batchId: mockBatchRow.id,
          stage: 'FINAL',
          sampleSize: 10,
          passedUnits: 8,
          failedUnits: 4, // 8 + 4 = 12 > 10
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Validation error');
    });

    it('rejects completed inspection when units do not reconcile to sample size', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);

      // Caught by Zod runtime contract validation
      const res = await request(app)
        .post('/api/v1/quality/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          batchId: mockBatchRow.id,
          stage: 'FINAL',
          sampleSize: 10,
          passedUnits: 6,
          failedUnits: 2, // 6 + 2 = 8 != 10
          status: 'COMPLETED',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Validation error');
    });

    it('rejects contradictory result (result = PASS when failedUnits > 0)', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);

      // Caught by Zod runtime contract validation
      const res = await request(app)
        .post('/api/v1/quality/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          batchId: mockBatchRow.id,
          stage: 'FINAL',
          sampleSize: 10,
          passedUnits: 8,
          failedUnits: 2,
          status: 'COMPLETED',
          result: 'PASS', // Contradictory!
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Validation error');
    });

    it('automatically derives FAIL when failedUnits > 0 and no result provided', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue(mockBatchRow);
      vi.spyOn(inspectionsRepository, 'getNextAttemptNumber').mockResolvedValue(1);
      vi.spyOn(inspectionsRepository, 'findByBatchStageAttempt').mockResolvedValue(null);
      vi.spyOn(inspectionsRepository, 'generateInspectionNumber').mockResolvedValue(
        'INSP-20261025-0003',
      );

      const createSpy = vi.spyOn(inspectionsRepository, 'create').mockResolvedValue({
        ...mockInspection,
        result: 'FAIL',
        passedUnits: 8,
        failedUnits: 2,
      });

      const res = await request(app)
        .post('/api/v1/quality/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          batchId: mockBatchRow.id,
          stage: 'FINAL',
          sampleSize: 10,
          passedUnits: 8,
          failedUnits: 2,
          status: 'COMPLETED',
        });

      expect(res.status).toBe(201);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'FAIL',
        }),
        expect.anything(),
      );
    });

    it('rejects duplicate attempt for the same batch, stage, and attemptNumber with 409 Conflict', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue(mockBatchRow);
      vi.spyOn(inspectionsRepository, 'findByBatchStageAttempt').mockResolvedValue(mockInspection);

      const res = await request(app)
        .post('/api/v1/quality/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          batchId: mockBatchRow.id,
          stage: 'FINAL',
          attemptNumber: 1,
          sampleSize: 10,
          passedUnits: 10,
          failedUnits: 0,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Audit Logging Verification', () => {
    it('audits CREATE action on inspection creation with actorId', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(inspectorUser);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue(mockBatchRow);
      vi.spyOn(inspectionsRepository, 'getNextAttemptNumber').mockResolvedValue(1);
      vi.spyOn(inspectionsRepository, 'findByBatchStageAttempt').mockResolvedValue(null);
      vi.spyOn(inspectionsRepository, 'generateInspectionNumber').mockResolvedValue(
        'INSP-20261025-0004',
      );
      vi.spyOn(inspectionsRepository, 'create').mockResolvedValue(mockInspection);
      const auditSpy = vi.spyOn(auditService, 'record').mockResolvedValue();

      const res = await request(app)
        .post('/api/v1/quality/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          batchId: mockBatchRow.id,
          stage: 'IN_PROCESS',
          sampleSize: 10,
          passedUnits: 10,
          failedUnits: 0,
        });

      expect(res.status).toBe(201);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'QUALITY_INSPECTION',
          actorId: inspectorUser.id,
          entityId: mockInspection.id,
        }),
      );
    });

    it('audits CORRECTION action on inspection patch with before and after state', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(qmUser);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue(mockInspection);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue(mockBatchRow);
      vi.spyOn(inspectionsRepository, 'update').mockResolvedValue({
        ...mockInspection,
        notes: 'Corrected measurement',
      });
      const auditSpy = vi.spyOn(auditService, 'record').mockResolvedValue();

      const res = await request(app)
        .patch(`/api/v1/quality/inspections/${mockInspection.id}`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({
          notes: 'Corrected measurement',
          reasonForCorrection: 'Manual correction of measurement values',
        });

      expect(res.status).toBe(200);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CORRECTION',
          entityType: 'QUALITY_INSPECTION',
          actorId: qmUser.id,
          entityId: mockInspection.id,
          beforeState: expect.anything(),
          afterState: expect.objectContaining({
            reasonForCorrection: 'Manual correction of measurement values',
          }),
        }),
      );
    });
  });

  describe('Inspection Querying & Details', () => {
    it('returns 404 Not Found when inspection does not exist', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/quality/inspections/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns inspection detail with joined batch, product, and inspector info', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(inspectionsRepository, 'findById').mockResolvedValue(mockInspection);

      const res = await request(app)
        .get(`/api/v1/quality/inspections/${mockInspection.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.item.id).toBe(mockInspection.id);
      expect(res.body.item.batchNumber).toBe(mockBatchRow.batch_number);
      expect(res.body.item.productCode).toBe('PRD-001');
      expect(res.body.item.inspectorUsername).toBe(inspectorUser.username);
    });
  });
});
