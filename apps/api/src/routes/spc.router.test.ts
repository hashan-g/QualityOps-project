import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { PoolClient, QueryResult } from 'pg';
import { createApp } from '../app.js';
import { pool } from '../infrastructure/database/pool.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { TokenService } from '../infrastructure/security/token.service.js';
import { spcRepository } from '../modules/analytics/spc/spc.repository.js';
import { spcAnalyticsClient } from '../modules/analytics/spc/spc-analytics.client.js';

const emptyRows: QueryResult = {
  rows: [],
  command: 'SELECT',
  rowCount: 0,
  oid: 0,
  fields: [],
};

describe('Statistical Process Monitoring API (/api/v1/analytics/quality/spc/p-chart)', () => {
  const app = createApp();

  const mockClient = {
    query: vi.fn().mockResolvedValue(emptyRows),
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
    username: 'inspector_user',
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
    username: 'operator_user',
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
    full_name: 'Executive Viewer',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['VIEWER' as const],
  };

  let qmToken: string;
  let adminToken: string;
  let supervisorToken: string;
  let inspectorToken: string;
  let operatorToken: string;
  let viewerToken: string;

  const validProductId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const validLineId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const mockProcessContext = {
    product: {
      id: validProductId,
      code: 'PRD-001',
      name: 'Precision Gearbox',
    },
    line: {
      id: validLineId,
      name: 'Assembly Line 1',
    },
    shift: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);

    vi.spyOn(authRepository, 'findById').mockImplementation(async (id: string) => {
      if (id === adminUser.id) return adminUser;
      if (id === qmUser.id) return qmUser;
      if (id === supervisorUser.id) return supervisorUser;
      if (id === inspectorUser.id) return inspectorUser;
      if (id === operatorUser.id) return operatorUser;
      if (id === viewerUser.id) return viewerUser;
      return null;
    });

    qmToken = TokenService.signAccessToken({
      userId: qmUser.id,
      username: qmUser.username,
      roles: qmUser.roles,
    }).token;
    adminToken = TokenService.signAccessToken({
      userId: adminUser.id,
      username: adminUser.username,
      roles: adminUser.roles,
    }).token;
    supervisorToken = TokenService.signAccessToken({
      userId: supervisorUser.id,
      username: supervisorUser.username,
      roles: supervisorUser.roles,
    }).token;
    inspectorToken = TokenService.signAccessToken({
      userId: inspectorUser.id,
      username: inspectorUser.username,
      roles: inspectorUser.roles,
    }).token;
    operatorToken = TokenService.signAccessToken({
      userId: operatorUser.id,
      username: operatorUser.username,
      roles: operatorUser.roles,
    }).token;
    viewerToken = TokenService.signAccessToken({
      userId: viewerUser.id,
      username: viewerUser.username,
      roles: viewerUser.roles,
    }).token;
  });

  describe('Authentication & Gateways', () => {
    it('returns 401 Unauthorized for unauthenticated request', async () => {
      const res = await request(app).get('/api/v1/analytics/quality/spc/p-chart');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('permits read access across all 6 canonical roles', async () => {
      vi.spyOn(spcRepository, 'getProcessContext').mockResolvedValue(mockProcessContext);
      vi.spyOn(spcRepository, 'getCompletedInspectionSubgroups').mockResolvedValue([]);
      vi.spyOn(spcAnalyticsClient, 'calculatePChart').mockResolvedValue({
        status: 'INSUFFICIENT_DATA',
        baseline: {
          subgroupCount: 0,
          minimumRequired: 20,
          totalSampleSize: 0,
          totalFailedUnits: 0,
          pBar: null,
        },
        summary: {
          signalCount: 0,
          upperSignalCount: 0,
          lowerSignalCount: 0,
          interpretation: 'No subgroups found.',
        },
        points: [],
        warnings: [],
      });

      const tokens = [
        adminToken,
        qmToken,
        supervisorToken,
        inspectorToken,
        operatorToken,
        viewerToken,
      ];

      for (const token of tokens) {
        const res = await request(app)
          .get('/api/v1/analytics/quality/spc/p-chart')
          .set('Authorization', `Bearer ${token}`)
          .query({
            productId: validProductId,
            productionLineId: validLineId,
            from: '2026-01-01T00:00:00Z',
            to: '2026-03-31T23:59:59Z',
          });

        expect(res.status).toBe(200);
      }
    });
  });

  describe('Filter Validation & Boundaries', () => {
    it('rejects missing productId with 400 Bad Request', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/quality/spc/p-chart')
        .set('Authorization', `Bearer ${qmToken}`)
        .query({
          productionLineId: validLineId,
          from: '2026-01-01T00:00:00Z',
          to: '2026-03-31T23:59:59Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Invalid SPC filter parameters');
    });

    it('rejects missing productionLineId with 400 Bad Request', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/quality/spc/p-chart')
        .set('Authorization', `Bearer ${qmToken}`)
        .query({
          productId: validProductId,
          from: '2026-01-01T00:00:00Z',
          to: '2026-03-31T23:59:59Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Invalid SPC filter parameters');
    });

    it('rejects inverted date range (from > to) with 400 Bad Request', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/quality/spc/p-chart')
        .set('Authorization', `Bearer ${qmToken}`)
        .query({
          productId: validProductId,
          productionLineId: validLineId,
          from: '2026-06-01T00:00:00Z',
          to: '2026-01-01T00:00:00Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.details[0].message).toContain('must not be after');
    });

    it('rejects unbounded date window (> 366 days) with 400 Bad Request', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/quality/spc/p-chart')
        .set('Authorization', `Bearer ${qmToken}`)
        .query({
          productId: validProductId,
          productionLineId: validLineId,
          from: '2024-01-01T00:00:00Z',
          to: '2026-01-01T00:00:00Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.details[0].message).toContain('cannot exceed 366 days');
    });

    it('returns 404 when requested product or line does not exist in master data', async () => {
      vi.spyOn(spcRepository, 'getProcessContext').mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/analytics/quality/spc/p-chart')
        .set('Authorization', `Bearer ${qmToken}`)
        .query({
          productId: validProductId,
          productionLineId: validLineId,
          from: '2026-01-01T00:00:00Z',
          to: '2026-03-31T23:59:59Z',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('not found in master data');
    });
  });

  describe('P-Chart Subgroup Aggregation & Service Calculation', () => {
    it('returns READY status with variable control limits and signals when >= 20 subgroups exist', async () => {
      vi.spyOn(spcRepository, 'getProcessContext').mockResolvedValue(mockProcessContext);

      const mockDbRows = Array.from({ length: 20 }, (_, idx) => ({
        id: `00000000-0000-0000-0000-${(idx + 1).toString().padStart(12, '0')}`,
        inspection_number: `INSP-2026-${(idx + 1).toString().padStart(4, '0')}`,
        batch_id: '11111111-1111-1111-1111-111111111111',
        batch_number: 'BATCH-2026-001',
        inspected_at: new Date(`2026-01-${(idx + 1).toString().padStart(2, '0')}T08:00:00Z`),
        sample_size: 100,
        failed_units: idx === 19 ? 15 : 4,
        stage: 'FINAL',
      }));

      vi.spyOn(spcRepository, 'getCompletedInspectionSubgroups').mockResolvedValue(mockDbRows);

      vi.spyOn(spcAnalyticsClient, 'calculatePChart').mockResolvedValue({
        status: 'READY',
        baseline: {
          subgroupCount: 20,
          minimumRequired: 20,
          totalSampleSize: 2000,
          totalFailedUnits: 91,
          pBar: 0.0455,
        },
        summary: {
          signalCount: 1,
          upperSignalCount: 1,
          lowerSignalCount: 0,
          interpretation:
            '1 of 20 subgroup(s) exhibited failure proportions outside 3-sigma statistical control limits.',
        },
        points: mockDbRows.map((r, i) => ({
          inspectionId: r.id,
          inspectionNumber: r.inspection_number,
          batchId: r.batch_id,
          batchNumber: r.batch_number,
          timestamp: r.inspected_at.toISOString(),
          sampleSize: r.sample_size,
          failedUnits: r.failed_units,
          observedProportion: r.failed_units / r.sample_size,
          centerLine: 0.0455,
          upperControlLimit: 0.108,
          lowerControlLimit: 0.0,
          signal: i === 19,
          signalReason: i === 19 ? 'ABOVE_UCL' : null,
        })),
        warnings: [],
      });

      const res = await request(app)
        .get('/api/v1/analytics/quality/spc/p-chart')
        .set('Authorization', `Bearer ${qmToken}`)
        .query({
          productId: validProductId,
          productionLineId: validLineId,
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-31T23:59:59Z',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('READY');
      expect(res.body.baseline.subgroupCount).toBe(20);
      expect(res.body.baseline.pBar).toBe(0.0455);
      expect(res.body.summary.signalCount).toBe(1);
      expect(res.body.points).toHaveLength(20);
      expect(res.body.filters.productCode).toBe('PRD-001');
      expect(res.body.filters.productionLineName).toBe('Assembly Line 1');
    });

    it('returns INSUFFICIENT_DATA status and does not fabricate limits when < 20 subgroups exist', async () => {
      vi.spyOn(spcRepository, 'getProcessContext').mockResolvedValue(mockProcessContext);

      const mockDbRows = Array.from({ length: 5 }, (_, idx) => ({
        id: `00000000-0000-0000-0000-${(idx + 1).toString().padStart(12, '0')}`,
        inspection_number: `INSP-2026-${(idx + 1).toString().padStart(4, '0')}`,
        batch_id: '11111111-1111-1111-1111-111111111111',
        batch_number: 'BATCH-2026-001',
        inspected_at: new Date(`2026-01-${(idx + 1).toString().padStart(2, '0')}T08:00:00Z`),
        sample_size: 50,
        failed_units: 2,
        stage: 'FINAL',
      }));

      vi.spyOn(spcRepository, 'getCompletedInspectionSubgroups').mockResolvedValue(mockDbRows);

      vi.spyOn(spcAnalyticsClient, 'calculatePChart').mockResolvedValue({
        status: 'INSUFFICIENT_DATA',
        baseline: {
          subgroupCount: 5,
          minimumRequired: 20,
          totalSampleSize: 250,
          totalFailedUnits: 10,
          pBar: null,
        },
        summary: {
          signalCount: 0,
          upperSignalCount: 0,
          lowerSignalCount: 0,
          interpretation: 'Insufficient completed inspection subgroups (5 observed, 20 required).',
        },
        points: mockDbRows.map((r) => ({
          inspectionId: r.id,
          inspectionNumber: r.inspection_number,
          batchId: r.batch_id,
          batchNumber: r.batch_number,
          timestamp: r.inspected_at.toISOString(),
          sampleSize: r.sample_size,
          failedUnits: r.failed_units,
          observedProportion: r.failed_units / r.sample_size,
          centerLine: null,
          upperControlLimit: null,
          lowerControlLimit: null,
          signal: false,
          signalReason: null,
        })),
        warnings: [
          'Insufficient data: 5 completed inspection subgroups observed; minimum threshold is 20.',
        ],
      });

      const res = await request(app)
        .get('/api/v1/analytics/quality/spc/p-chart')
        .set('Authorization', `Bearer ${qmToken}`)
        .query({
          productId: validProductId,
          productionLineId: validLineId,
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-31T23:59:59Z',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('INSUFFICIENT_DATA');
      expect(res.body.baseline.pBar).toBeNull();
      expect(res.body.points[0].centerLine).toBeNull();
      expect(res.body.points[0].upperControlLimit).toBeNull();
    });

    it('returns DEGENERATE_BASELINE when all inspections have 0 defectives', async () => {
      vi.spyOn(spcRepository, 'getProcessContext').mockResolvedValue(mockProcessContext);

      const mockDbRows = Array.from({ length: 22 }, (_, idx) => ({
        id: `00000000-0000-0000-0000-${(idx + 1).toString().padStart(12, '0')}`,
        inspection_number: `INSP-2026-${(idx + 1).toString().padStart(4, '0')}`,
        batch_id: '11111111-1111-1111-1111-111111111111',
        batch_number: 'BATCH-2026-001',
        inspected_at: new Date(`2026-01-${(idx + 1).toString().padStart(2, '0')}T08:00:00Z`),
        sample_size: 50,
        failed_units: 0,
        stage: 'FINAL',
      }));

      vi.spyOn(spcRepository, 'getCompletedInspectionSubgroups').mockResolvedValue(mockDbRows);

      vi.spyOn(spcAnalyticsClient, 'calculatePChart').mockResolvedValue({
        status: 'DEGENERATE_BASELINE',
        baseline: {
          subgroupCount: 22,
          minimumRequired: 20,
          totalSampleSize: 1100,
          totalFailedUnits: 0,
          pBar: 0.0,
        },
        summary: {
          signalCount: 0,
          upperSignalCount: 0,
          lowerSignalCount: 0,
          interpretation:
            'Degenerate process baseline detected (pooled fraction defective is 0.0000).',
        },
        points: mockDbRows.map((r) => ({
          inspectionId: r.id,
          inspectionNumber: r.inspection_number,
          batchId: r.batch_id,
          batchNumber: r.batch_number,
          timestamp: r.inspected_at.toISOString(),
          sampleSize: r.sample_size,
          failedUnits: r.failed_units,
          observedProportion: 0.0,
          centerLine: 0.0,
          upperControlLimit: null,
          lowerControlLimit: null,
          signal: false,
          signalReason: null,
        })),
        warnings: [
          'Degenerate baseline: pooled fraction defective is 0. Standard error is 0; conventional 3-sigma control limits collapse.',
        ],
      });

      const res = await request(app)
        .get('/api/v1/analytics/quality/spc/p-chart')
        .set('Authorization', `Bearer ${qmToken}`)
        .query({
          productId: validProductId,
          productionLineId: validLineId,
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-31T23:59:59Z',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DEGENERATE_BASELINE');
      expect(res.body.baseline.pBar).toBe(0.0);
    });
  });

  describe('Service Failure & Reliability Handling', () => {
    it('returns 503 Service Unavailable when analytics service is unreachable or times out', async () => {
      vi.spyOn(spcRepository, 'getProcessContext').mockResolvedValue(mockProcessContext);
      vi.spyOn(spcRepository, 'getCompletedInspectionSubgroups').mockResolvedValue([]);

      // Simulate network connection failure or timeout
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:8000'),
      );

      const res = await request(app)
        .get('/api/v1/analytics/quality/spc/p-chart')
        .set('Authorization', `Bearer ${qmToken}`)
        .query({
          productId: validProductId,
          productionLineId: validLineId,
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-31T23:59:59Z',
        });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(res.body.error.message).toContain(
        'Statistical analytics calculation service is temporarily unavailable',
      );
      // Verify no internal credentials or raw urls leaked
      expect(res.body.error.message).not.toContain('ECONNREFUSED');
    });
  });
});
