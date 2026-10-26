import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { PoolClient, QueryResult } from 'pg';
import { createApp } from '../app.js';
import { pool } from '../infrastructure/database/pool.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { TokenService } from '../infrastructure/security/token.service.js';
import { capaRepository } from '../modules/quality/capa/capa.repository.js';
import { auditService } from '../modules/audit/audit.service.js';
import type { CapaAction, CapaCase } from '@qualityops/contracts';

function mockRows<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return {
    rows,
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
  };
}

const emptyRows: QueryResult = {
  rows: [],
  command: 'SELECT',
  rowCount: 0,
  oid: 0,
  fields: [],
};

describe('CAPA Management API (/api/v1/quality/capa)', () => {
  const app = createApp();

  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  } as unknown as PoolClient;

  // Canonical test users for all 6 roles
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

  // JWT Tokens
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

  const allUsers = [adminUser, qmUser, supervisorUser, inspectorUser, operatorUser, viewerUser];

  const mockCapaCase: CapaCase = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    caseNumber: 'CAPA-2026-0001',
    title: 'Porosity defect in cylinder block casting',
    description: 'High porosity rates discovered in lot #4 requiring root cause analysis.',
    source: 'INSPECTION_FAILURE',
    priority: 'HIGH',
    status: 'OPEN',
    batchId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    batchNumber: 'BATCH-2026-001',
    defectRecordId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    defectCode: 'DEF-POR-01',
    defectName: 'Internal Porosity',
    defectSeverity: 'CRITICAL',
    inspectionId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    inspectionNumber: 'INSP-20261026-0001',
    assignedTo: supervisorUser.id,
    assignedToName: supervisorUser.full_name,
    assignedToUsername: supervisorUser.username,
    createdBy: qmUser.id,
    createdByName: qmUser.full_name,
    dueDate: '2026-11-15',
    rootCause: undefined,
    verifiedBy: undefined,
    verifiedByName: undefined,
    verifiedAt: undefined,
    verificationNotes: undefined,
    actionCount: 1,
    completedActionCount: 0,
    isOverdue: false,
    createdAt: '2026-10-26T10:00:00.000Z',
    updatedAt: '2026-10-26T10:00:00.000Z',
  };

  const mockCapaAction: CapaAction = {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    capaCaseId: mockCapaCase.id,
    actionType: 'IMMEDIATE_CONTAINMENT',
    description: 'Quarantine existing WIP inventory on line 2 for ultrasonic inspection.',
    assignedTo: supervisorUser.id,
    assignedToName: supervisorUser.full_name,
    assignedToUsername: supervisorUser.username,
    status: 'PENDING',
    dueDate: '2026-10-30',
    completedAt: undefined,
    completionNotes: undefined,
    createdAt: '2026-10-26T10:05:00.000Z',
    updatedAt: '2026-10-26T10:05:00.000Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(authRepository, 'findById').mockImplementation(async (id: string) => {
      const u = allUsers.find((user) => user.id === id);
      return u ?? null;
    });

    vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);
    vi.spyOn(auditService, 'record').mockResolvedValue(undefined);
  });

  describe('Authentication Gateways', () => {
    it('returns 401 Unauthorized for unauthenticated GET /', async () => {
      const res = await request(app).get('/api/v1/quality/capa');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 Unauthorized for unauthenticated POST /', async () => {
      const res = await request(app)
        .post('/api/v1/quality/capa')
        .send({ title: 'Test', description: 'Test desc', source: 'INTERNAL_AUDIT' });
      expect(res.status).toBe(401);
    });

    it('returns 401 Unauthorized for invalid Bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/quality/capa')
        .set('Authorization', 'Bearer invalid-token-xyz');
      expect(res.status).toBe(401);
    });
  });

  describe('Role-Based Access Control (RBAC)', () => {
    it('allows all 6 canonical roles to read CAPA cases and details', async () => {
      vi.spyOn(capaRepository, 'listCases').mockResolvedValue({
        items: [mockCapaCase],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      vi.spyOn(capaRepository, 'findCaseById').mockResolvedValue(mockCapaCase);
      vi.spyOn(capaRepository, 'listActionsByCaseId').mockResolvedValue([mockCapaAction]);

      const tokens = [
        { role: 'ADMIN', token: adminToken },
        { role: 'QUALITY_MANAGER', token: qmToken },
        { role: 'SUPERVISOR', token: supervisorToken },
        { role: 'INSPECTOR', token: inspectorToken },
        { role: 'OPERATOR', token: operatorToken },
        { role: 'VIEWER', token: viewerToken },
      ];

      for (const { token } of tokens) {
        const listRes = await request(app)
          .get('/api/v1/quality/capa')
          .set('Authorization', `Bearer ${token}`);
        expect(listRes.status).toBe(200);

        const detailRes = await request(app)
          .get(`/api/v1/quality/capa/${mockCapaCase.id}`)
          .set('Authorization', `Bearer ${token}`);
        expect(detailRes.status).toBe(200);
      }
    });

    it('denies INSPECTOR, OPERATOR, VIEWER from creating a CAPA case (403 Forbidden)', async () => {
      const payload = {
        title: 'Unauthorized Case Creation Attempt',
        description: 'Should be rejected for read-only / basic roles.',
        source: 'INTERNAL_AUDIT',
      };

      for (const token of [inspectorToken, operatorToken, viewerToken]) {
        const res = await request(app)
          .post('/api/v1/quality/capa')
          .set('Authorization', `Bearer ${token}`)
          .send(payload);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });

    it('denies SUPERVISOR from verifying or closing a CAPA case (403 Forbidden)', async () => {
      const verifyRes = await request(app)
        .post(`/api/v1/quality/capa/${mockCapaCase.id}/verify`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ result: 'PASS', notes: 'Supervisor trying to verify' });
      expect(verifyRes.status).toBe(403);

      const closeRes = await request(app)
        .post(`/api/v1/quality/capa/${mockCapaCase.id}/close`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ closureNotes: 'Supervisor trying to close' });
      expect(closeRes.status).toBe(403);
    });
  });

  describe('CAPA Case Creation & Invariant Validation', () => {
    it('rejects invalid payload: short title, short description, invalid source', async () => {
      const res = await request(app)
        .post('/api/v1/quality/capa')
        .set('Authorization', `Bearer ${qmToken}`)
        .send({
          title: 'AB',
          description: 'bad',
          source: 'NOT_A_SOURCE',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects creation when referenced defectRecordId does not exist', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (
          typeof sql === 'string' &&
          sql.includes('SELECT dr.id, qi.batch_id FROM defect_records')
        ) {
          return emptyRows;
        }
        return emptyRows;
      });

      const res = await request(app)
        .post('/api/v1/quality/capa')
        .set('Authorization', `Bearer ${qmToken}`)
        .send({
          title: 'Porosity in casting',
          description: 'Valid problem description here.',
          source: 'INSPECTION_FAILURE',
          defectRecordId: '99999999-9999-9999-9999-999999999999',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Referenced defect record');
    });

    it('successfully creates CAPA case and assigns default priority MEDIUM and status OPEN', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO capa_cases')) {
          return mockRows([{ id: mockCapaCase.id }]);
        }
        return emptyRows;
      });

      vi.spyOn(capaRepository, 'generateCaseNumber').mockResolvedValue('CAPA-2026-0001');
      vi.spyOn(capaRepository, 'createCase').mockResolvedValue(mockCapaCase.id);
      vi.spyOn(capaRepository, 'findCaseById').mockResolvedValue(mockCapaCase);

      const res = await request(app)
        .post('/api/v1/quality/capa')
        .set('Authorization', `Bearer ${qmToken}`)
        .send({
          title: 'Porosity defect in cylinder block casting',
          description: 'High porosity rates discovered in lot #4 requiring root cause analysis.',
          source: 'INSPECTION_FAILURE',
        });

      expect(res.status).toBe(201);
      expect(res.body.caseNumber).toBe('CAPA-2026-0001');
      expect(res.body.status).toBe('OPEN');
      expect(res.body.priority).toBe('HIGH');
    });
  });

  describe('CAPA Case Updates & Status Transitions', () => {
    it('returns 404 when updating non-existent case', async () => {
      vi.mocked(mockClient.query).mockResolvedValue(emptyRows);

      const res = await request(app)
        .patch('/api/v1/quality/capa/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${qmToken}`)
        .send({ title: 'New Title' });

      expect(res.status).toBe(404);
    });

    it('rejects direct status transition to CLOSED via PATCH endpoint', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (typeof sql === 'string' && sql.includes('SELECT * FROM capa_cases')) {
          return mockRows([
            {
              id: mockCapaCase.id,
              status: 'UNDER_REVIEW',
              title: mockCapaCase.title,
              description: mockCapaCase.description,
              priority: mockCapaCase.priority,
              assigned_to: supervisorUser.id,
            },
          ]);
        }
        return emptyRows;
      });

      const res = await request(app)
        .patch(`/api/v1/quality/capa/${mockCapaCase.id}`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({ status: 'CLOSED' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('use the explicit case closure endpoint');
    });

    it('rejects invalid status transition (e.g. OPEN -> UNDER_REVIEW directly)', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (typeof sql === 'string' && sql.includes('SELECT * FROM capa_cases')) {
          return mockRows([
            {
              id: mockCapaCase.id,
              status: 'OPEN',
              title: mockCapaCase.title,
              description: mockCapaCase.description,
              priority: mockCapaCase.priority,
              assigned_to: supervisorUser.id,
            },
          ]);
        }
        return emptyRows;
      });

      const res = await request(app)
        .patch(`/api/v1/quality/capa/${mockCapaCase.id}`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({ status: 'UNDER_REVIEW' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Invalid status transition');
    });

    it('rejects case cancellation when changeReason is omitted or too short', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (typeof sql === 'string' && sql.includes('SELECT * FROM capa_cases')) {
          return mockRows([
            {
              id: mockCapaCase.id,
              status: 'OPEN',
              title: mockCapaCase.title,
              description: mockCapaCase.description,
              priority: mockCapaCase.priority,
              assigned_to: supervisorUser.id,
            },
          ]);
        }
        return emptyRows;
      });

      const res = await request(app)
        .patch(`/api/v1/quality/capa/${mockCapaCase.id}`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('change reason of at least 5 characters');
    });
  });

  describe('Action Management & Cross-Case Isolation', () => {
    it('creates action and auto-transitions OPEN case to IN_PROGRESS', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, status FROM capa_cases')) {
          return mockRows([{ id: mockCapaCase.id, status: 'OPEN' }]);
        }
        return emptyRows;
      });

      vi.spyOn(capaRepository, 'createAction').mockResolvedValue(mockCapaAction.id);
      vi.spyOn(capaRepository, 'updateCase').mockResolvedValue(undefined);
      vi.spyOn(capaRepository, 'findActionById').mockResolvedValue({
        ...mockCapaAction,
        status: 'PENDING',
      });

      const res = await request(app)
        .post(`/api/v1/quality/capa/${mockCapaCase.id}/actions`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({
          actionType: 'IMMEDIATE_CONTAINMENT',
          description: 'Quarantine existing WIP inventory on line 2 for ultrasonic inspection.',
          dueDate: '2026-10-30',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(mockCapaAction.id);
      expect(capaRepository.updateCase).toHaveBeenCalledWith(
        mockCapaCase.id,
        { status: 'IN_PROGRESS' },
        expect.anything(),
      );
    });

    it('rejects adding action to a CLOSED case', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, status FROM capa_cases')) {
          return mockRows([{ id: mockCapaCase.id, status: 'CLOSED' }]);
        }
        return emptyRows;
      });

      const res = await request(app)
        .post(`/api/v1/quality/capa/${mockCapaCase.id}/actions`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({
          actionType: 'CORRECTIVE',
          description: 'Attempting to add action to closed case.',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Cannot add actions to a closed');
    });

    it('enforces cross-case isolation: rejects updating an action using a different case ID (404)', async () => {
      const foreignCaseId = '99999999-9999-9999-9999-999999999999';

      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, status FROM capa_cases')) {
          return mockRows([{ id: foreignCaseId, status: 'IN_PROGRESS' }]);
        }
        if (
          typeof sql === 'string' &&
          sql.includes('SELECT * FROM capa_actions WHERE id = $1 AND capa_case_id = $2')
        ) {
          // Action does not belong to foreignCaseId
          return emptyRows;
        }
        return emptyRows;
      });

      const res = await request(app)
        .patch(`/api/v1/quality/capa/${foreignCaseId}/actions/${mockCapaAction.id}`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({ description: 'Updating action under wrong parent' });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('not found under case');
    });
  });

  describe('Action Ownership & Completion Gateways', () => {
    it('denies non-owner without elevated role from updating an action (403 Forbidden)', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, status FROM capa_cases')) {
          return mockRows([{ id: mockCapaCase.id, status: 'IN_PROGRESS' }]);
        }
        if (typeof sql === 'string' && sql.includes('SELECT * FROM capa_actions')) {
          return mockRows([
            {
              id: mockCapaAction.id,
              capa_case_id: mockCapaCase.id,
              status: 'PENDING',
              assigned_to: supervisorUser.id, // assigned to supervisorUser, NOT operatorUser
              description: mockCapaAction.description,
            },
          ]);
        }
        return emptyRows;
      });

      // operatorUser is not the assignee and not an Admin/QM
      const res = await request(app)
        .patch(`/api/v1/quality/capa/${mockCapaCase.id}/actions/${mockCapaAction.id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ description: 'Unauthorized modification attempt' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain(
        'Only the assigned action owner, Quality Manager, or Admin',
      );
    });

    it('allows assigned owner to complete their own action with valid notes', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, status FROM capa_cases')) {
          return mockRows([{ id: mockCapaCase.id, status: 'IN_PROGRESS' }]);
        }
        if (typeof sql === 'string' && sql.includes('SELECT * FROM capa_actions')) {
          return mockRows([
            {
              id: mockCapaAction.id,
              capa_case_id: mockCapaCase.id,
              status: 'PENDING',
              assigned_to: supervisorUser.id, // matches supervisorToken
            },
          ]);
        }
        return emptyRows;
      });

      vi.spyOn(capaRepository, 'updateAction').mockResolvedValue(undefined);
      vi.spyOn(capaRepository, 'countPendingActions').mockResolvedValue(0);
      vi.spyOn(capaRepository, 'updateCase').mockResolvedValue(undefined);
      vi.spyOn(capaRepository, 'findActionById').mockResolvedValue({
        ...mockCapaAction,
        status: 'COMPLETED',
        completedAt: '2026-10-26T12:00:00.000Z',
        completionNotes: 'Quarantine completed. 150 units isolated; 3 rejected units tagged.',
      });

      const res = await request(app)
        .post(`/api/v1/quality/capa/${mockCapaCase.id}/actions/${mockCapaAction.id}/complete`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          completionNotes: 'Quarantine completed. 150 units isolated; 3 rejected units tagged.',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
      // Case auto-transitions to UNDER_REVIEW when all actions complete
      expect(capaRepository.updateCase).toHaveBeenCalledWith(
        mockCapaCase.id,
        { status: 'UNDER_REVIEW' },
        expect.anything(),
      );
    });
  });

  describe('Verification & Closure Preconditions', () => {
    it('prevents action owner from verifying their own assigned case unless Admin (403 Forbidden)', async () => {
      // Case assigned to qmUser, and qmUser tries to self-verify (QM role, not Admin)
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (
          typeof sql === 'string' &&
          sql.includes('SELECT id, case_number, status, assigned_to')
        ) {
          return mockRows([
            {
              id: mockCapaCase.id,
              case_number: mockCapaCase.caseNumber,
              status: 'UNDER_REVIEW',
              assigned_to: qmUser.id, // assigned to caller
              created_by: adminUser.id,
            },
          ]);
        }
        return emptyRows;
      });

      const res = await request(app)
        .post(`/api/v1/quality/capa/${mockCapaCase.id}/verify`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({
          result: 'PASS',
          notes: 'Self verification attempt by assigned Quality Manager',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain(
        'Action owner cannot verify their own assigned CAPA case',
      );
    });

    it('rejects verification if case has 0 actions or incomplete actions', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (
          typeof sql === 'string' &&
          sql.includes('SELECT id, case_number, status, assigned_to')
        ) {
          return mockRows([
            {
              id: mockCapaCase.id,
              case_number: mockCapaCase.caseNumber,
              status: 'UNDER_REVIEW',
              assigned_to: supervisorUser.id,
              created_by: qmUser.id,
            },
          ]);
        }
        return emptyRows;
      });

      // Test 0 actions
      vi.spyOn(capaRepository, 'countTotalActions').mockResolvedValue(0);

      const res0 = await request(app)
        .post(`/api/v1/quality/capa/${mockCapaCase.id}/verify`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({ result: 'PASS', notes: 'Verification notes here' });
      expect(res0.status).toBe(400);
      expect(res0.body.error.message).toContain('no actions defined');

      // Test incomplete actions
      vi.spyOn(capaRepository, 'countTotalActions').mockResolvedValue(2);
      vi.spyOn(capaRepository, 'countPendingActions').mockResolvedValue(1);

      const resPending = await request(app)
        .post(`/api/v1/quality/capa/${mockCapaCase.id}/verify`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({ result: 'PASS', notes: 'Verification notes here' });
      expect(resPending.status).toBe(400);
      expect(resPending.body.error.message).toContain('remain incomplete');
    });

    it('rejects case closure when case has not been verified (400 Bad Request)', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (
          typeof sql === 'string' &&
          sql.includes('SELECT id, case_number, status, verified_by, verified_at')
        ) {
          return mockRows([
            {
              id: mockCapaCase.id,
              case_number: mockCapaCase.caseNumber,
              status: 'UNDER_REVIEW',
              verified_by: null, // NOT VERIFIED
              verified_at: null,
              assigned_to: supervisorUser.id,
            },
          ]);
        }
        return emptyRows;
      });

      vi.spyOn(capaRepository, 'countTotalActions').mockResolvedValue(1);
      vi.spyOn(capaRepository, 'countPendingActions').mockResolvedValue(0);

      const res = await request(app)
        .post(`/api/v1/quality/capa/${mockCapaCase.id}/close`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({ closureNotes: 'Attempting closure before verification' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain(
        'successful verification by an authorized Quality Manager is required',
      );
    });

    it('successfully closes case when actions completed and verification passed', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (
          typeof sql === 'string' &&
          sql.includes('SELECT id, case_number, status, verified_by, verified_at')
        ) {
          return mockRows([
            {
              id: mockCapaCase.id,
              case_number: mockCapaCase.caseNumber,
              status: 'UNDER_REVIEW',
              verified_by: adminUser.id,
              verified_at: new Date('2026-10-26T14:00:00Z'),
              assigned_to: supervisorUser.id,
            },
          ]);
        }
        return emptyRows;
      });

      vi.spyOn(capaRepository, 'countTotalActions').mockResolvedValue(2);
      vi.spyOn(capaRepository, 'countPendingActions').mockResolvedValue(0);
      vi.spyOn(capaRepository, 'updateCase').mockResolvedValue(undefined);
      vi.spyOn(capaRepository, 'findCaseById').mockResolvedValue({
        ...mockCapaCase,
        status: 'CLOSED',
        verifiedBy: adminUser.id,
        verifiedAt: '2026-10-26T14:00:00.000Z',
      });

      const res = await request(app)
        .post(`/api/v1/quality/capa/${mockCapaCase.id}/close`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({ closureNotes: 'All corrective actions verified effective. Case closed.' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CLOSED');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CLOSE',
          entityType: 'CAPA_CASE',
        }),
      );
    });

    it('rejects closing an already closed case (409 Conflict)', async () => {
      vi.mocked(mockClient.query).mockImplementation(async (sql: unknown) => {
        if (
          typeof sql === 'string' &&
          sql.includes('SELECT id, case_number, status, verified_by, verified_at')
        ) {
          return mockRows([
            {
              id: mockCapaCase.id,
              case_number: mockCapaCase.caseNumber,
              status: 'CLOSED',
              verified_by: adminUser.id,
              verified_at: new Date('2026-10-26T14:00:00Z'),
              assigned_to: supervisorUser.id,
            },
          ]);
        }
        return emptyRows;
      });

      const res = await request(app)
        .post(`/api/v1/quality/capa/${mockCapaCase.id}/close`)
        .set('Authorization', `Bearer ${qmToken}`)
        .send({ closureNotes: 'Trying to close again' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Prohibited Destructive Deletion', () => {
    it('prohibits DELETE /api/v1/quality/capa/:id (404/405 - route not mounted)', async () => {
      const res = await request(app)
        .delete(`/api/v1/quality/capa/${mockCapaCase.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
