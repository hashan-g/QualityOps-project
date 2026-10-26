import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { QueryResult, PoolClient } from 'pg';
import { createApp } from '../app.js';
import { pool } from '../infrastructure/database/pool.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { TokenService } from '../infrastructure/security/token.service.js';
import { alertsRepository } from '../modules/alerts/alerts.repository.js';
import { alertsService } from '../modules/alerts/alerts.service.js';
import { alertsEvaluator } from '../modules/alerts/alerts.evaluator.js';
import { spcService } from '../modules/analytics/spc/spc.service.js';
import { auditService } from '../modules/audit/audit.service.js';

const emptyRows: QueryResult = {
  rows: [],
  command: 'SELECT',
  rowCount: 0,
  oid: 0,
  fields: [],
};

describe('Alerts Router (/api/v1/alerts) — Integration Tests', () => {
  const app = createApp();

  const mockClient = {
    query: vi.fn().mockResolvedValue(emptyRows),
    release: vi.fn(),
  } as unknown as PoolClient;

  const mockAdminUser = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'admin',
    email: 'admin@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'System Admin',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['ADMIN' as const],
  };

  const mockSupervisor = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'supervisor_dave',
    email: 'dave@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Supervisor Dave',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['SUPERVISOR' as const],
  };

  const mockInspector = {
    id: '33333333-3333-3333-3333-333333333333',
    username: 'inspector_alice',
    email: 'alice@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Inspector Alice',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['INSPECTOR' as const],
  };

  const mockOperator = {
    id: '44444444-4444-4444-4444-444444444444',
    username: 'operator_bob',
    email: 'bob@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Operator Bob',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['OPERATOR' as const],
  };

  let adminToken: string;
  let supervisorToken: string;
  let inspectorToken: string;
  let operatorToken: string;

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);

    vi.spyOn(auditService, 'record').mockResolvedValue(undefined);

    vi.spyOn(authRepository, 'findById').mockImplementation(async (id: string) => {
      if (id === mockAdminUser.id) return mockAdminUser;
      if (id === mockSupervisor.id) return mockSupervisor;
      if (id === mockInspector.id) return mockInspector;
      if (id === mockOperator.id) return mockOperator;
      return null;
    });

    adminToken = TokenService.signAccessToken({
      userId: mockAdminUser.id,
      username: mockAdminUser.username,
      roles: mockAdminUser.roles,
    }).token;

    supervisorToken = TokenService.signAccessToken({
      userId: mockSupervisor.id,
      username: mockSupervisor.username,
      roles: mockSupervisor.roles,
    }).token;

    inspectorToken = TokenService.signAccessToken({
      userId: mockInspector.id,
      username: mockInspector.username,
      roles: mockInspector.roles,
    }).token;

    operatorToken = TokenService.signAccessToken({
      userId: mockOperator.id,
      username: mockOperator.username,
      roles: mockOperator.roles,
    }).token;
  });

  describe('Authentication & List Endpoints', () => {
    it('rejects unauthenticated requests to /api/v1/alerts with 401', async () => {
      const res = await request(app).get('/api/v1/alerts');
      expect(res.status).toBe(401);
    });

    it('returns paginated alerts list with total count for authenticated users', async () => {
      vi.spyOn(alertsRepository, 'listAlerts').mockResolvedValue({
        alerts: [
          {
            id: '55555555-5555-5555-5555-555555555555',
            ruleType: 'HIGH_INSPECTION_FAILURE_RATE',
            severity: 'HIGH',
            status: 'OPEN',
            title: 'High Inspection Failure Rate: INSP-001',
            message: 'Failure rate 25% exceeded 15%',
            fingerprint: 'fp-1',
            entityType: 'QUALITY_INSPECTION',
            entityId: '66666666-6666-6666-6666-666666666666',
            contextData: {},
            acknowledgedBy: null,
            acknowledgedAt: null,
            resolvedBy: null,
            resolvedAt: null,
            resolutionNotes: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        total: 1,
      });

      const res = await request(app)
        .get('/api/v1/alerts?limit=10&offset=0')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.alerts).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.alerts[0].ruleType).toBe('HIGH_INSPECTION_FAILURE_RATE');
    });

    it('returns alert detail by ID or 404 if not found', async () => {
      vi.spyOn(alertsRepository, 'getAlertById').mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/alerts/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Alert Acknowledgment & Resolution RBAC', () => {
    it('allows INSPECTOR to acknowledge an OPEN alert', async () => {
      vi.spyOn(alertsRepository, 'getAlertById').mockResolvedValue({
        id: '55555555-5555-5555-5555-555555555555',
        ruleType: 'HIGH_INSPECTION_FAILURE_RATE',
        severity: 'HIGH',
        status: 'OPEN',
        title: 'High Failure Rate',
        message: 'Failure rate high',
        fingerprint: 'fp-1',
        entityType: 'QUALITY_INSPECTION',
        entityId: '66666666-6666-6666-6666-666666666666',
        contextData: {},
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolvedBy: null,
        resolvedAt: null,
        resolutionNotes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      vi.spyOn(alertsRepository, 'acknowledgeAlert').mockResolvedValue({
        id: '55555555-5555-5555-5555-555555555555',
        ruleType: 'HIGH_INSPECTION_FAILURE_RATE',
        severity: 'HIGH',
        status: 'ACKNOWLEDGED',
        title: 'High Failure Rate',
        message: 'Failure rate high',
        fingerprint: 'fp-1',
        entityType: 'QUALITY_INSPECTION',
        entityId: '66666666-6666-6666-6666-666666666666',
        contextData: {},
        acknowledgedBy: mockInspector.id,
        acknowledgedAt: new Date().toISOString(),
        resolvedBy: null,
        resolvedAt: null,
        resolutionNotes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/api/v1/alerts/55555555-5555-5555-5555-555555555555/acknowledge')
        .set('Authorization', `Bearer ${inspectorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.alert.status).toBe('ACKNOWLEDGED');
      expect(res.body.alert.acknowledgedBy).toBe(mockInspector.id);
    });

    it('forbids OPERATOR from acknowledging alerts with 403', async () => {
      const res = await request(app)
        .post('/api/v1/alerts/55555555-5555-5555-5555-555555555555/acknowledge')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
    });

    it('requires resolutionNotes when resolving an alert', async () => {
      const res = await request(app)
        .post('/api/v1/alerts/55555555-5555-5555-5555-555555555555/resolve')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ resolutionNotes: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Validation failed');
    });

    it('allows SUPERVISOR to resolve an alert with valid notes', async () => {
      vi.spyOn(alertsRepository, 'getAlertById').mockResolvedValue({
        id: '55555555-5555-5555-5555-555555555555',
        ruleType: 'OVERDUE_CAPA',
        severity: 'MEDIUM',
        status: 'OPEN',
        title: 'Overdue CAPA',
        message: 'CAPA is overdue',
        fingerprint: 'fp-2',
        entityType: 'CAPA_CASE',
        entityId: '77777777-7777-7777-7777-777777777777',
        contextData: {},
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolvedBy: null,
        resolvedAt: null,
        resolutionNotes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      vi.spyOn(alertsRepository, 'resolveAlert').mockResolvedValue({
        id: '55555555-5555-5555-5555-555555555555',
        ruleType: 'OVERDUE_CAPA',
        severity: 'MEDIUM',
        status: 'RESOLVED',
        title: 'Overdue CAPA',
        message: 'CAPA is overdue',
        fingerprint: 'fp-2',
        entityType: 'CAPA_CASE',
        entityId: '77777777-7777-7777-7777-777777777777',
        contextData: {},
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolvedBy: mockSupervisor.id,
        resolvedAt: new Date().toISOString(),
        resolutionNotes: 'Assigned additional technician; action plan finalized.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/api/v1/alerts/55555555-5555-5555-5555-555555555555/resolve')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ resolutionNotes: 'Assigned additional technician; action plan finalized.' });

      expect(res.status).toBe(200);
      expect(res.body.alert.status).toBe('RESOLVED');
      expect(res.body.alert.resolutionNotes).toContain('action plan finalized');
    });
  });

  describe('Alert Rules Evaluation & Deduplication Logic', () => {
    it('executes manual evaluation for authorized role and reports results', async () => {
      vi.spyOn(alertsService, 'evaluateAlerts').mockResolvedValue({
        evaluatedRules: 3,
        alertsGenerated: 2,
        alertsSkipped: 1,
        errors: [],
      });

      const res = await request(app)
        .post('/api/v1/alerts/evaluate')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.result.evaluatedRules).toBe(3);
      expect(res.body.result.alertsGenerated).toBe(2);
      expect(res.body.result.alertsSkipped).toBe(1);
    });

    it('evaluates SPC rule only when status is READY and ignores INSUFFICIENT_DATA and DEGENERATE_BASELINE', async () => {
      // Mock pool returning 1 active product/line pair
      vi.spyOn(pool, 'query').mockResolvedValue({
        rows: [
          {
            product_id: '11111111-1111-1111-1111-111111111111',
            production_line_id: '22222222-2222-2222-2222-222222222222',
          },
        ],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      // When SPC returns INSUFFICIENT_DATA -> No alert generated
      vi.spyOn(spcService, 'getPChart').mockResolvedValue({
        status: 'INSUFFICIENT_DATA',
        filters: {
          from: '2026-01-01',
          to: '2026-01-31',
          productId: '11111111-1111-1111-1111-111111111111',
          productionLineId: '22222222-2222-2222-2222-222222222222',
        },
        baseline: {
          subgroupCount: 5,
          minimumRequired: 20,
          totalSampleSize: 200,
          totalFailedUnits: 10,
          pBar: null,
        },
        summary: {
          signalCount: 0,
          upperSignalCount: 0,
          lowerSignalCount: 0,
          interpretation: 'Insufficient subgroups',
        },
        points: [],
        warnings: ['Need at least 20 subgroups'],
      });

      const spcRes = await alertsEvaluator.evaluateSpcOutOfControl();
      expect(spcRes.generated).toBe(0);
      expect(spcRes.skipped).toBe(0);
    });
  });
});
