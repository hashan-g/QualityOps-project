import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { QueryResult, PoolClient } from 'pg';
import { createApp } from '../app.js';
import { pool } from '../infrastructure/database/pool.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { TokenService } from '../infrastructure/security/token.service.js';
import { reportsRepository } from '../modules/reports/reports.repository.js';
import { schedulesRepository } from '../modules/reports/schedules.repository.js';
import { spcService } from '../modules/analytics/spc/spc.service.js';
import { auditService } from '../modules/audit/audit.service.js';

const emptyRows: QueryResult = {
  rows: [],
  command: 'SELECT',
  rowCount: 0,
  oid: 0,
  fields: [],
};

describe('Reports Router (/api/v1/reports) — Integration Tests', () => {
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

  const mockQualityManager = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'manager_mary',
    email: 'mary@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Quality Manager Mary',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['QUALITY_MANAGER' as const],
  };

  const mockOperator = {
    id: '33333333-3333-3333-3333-333333333333',
    username: 'operator_sam',
    email: 'sam@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Line Operator Sam',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['OPERATOR' as const],
  };

  let adminToken: string;
  let qmToken: string;
  let operatorToken: string;

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);

    vi.spyOn(auditService, 'record').mockResolvedValue(undefined);

    vi.spyOn(authRepository, 'findById').mockImplementation(async (id: string) => {
      if (id === mockAdminUser.id) return mockAdminUser;
      if (id === mockQualityManager.id) return mockQualityManager;
      if (id === mockOperator.id) return mockOperator;
      return null;
    });

    adminToken = TokenService.signAccessToken({
      userId: mockAdminUser.id,
      username: mockAdminUser.username,
      roles: mockAdminUser.roles,
    }).token;

    qmToken = TokenService.signAccessToken({
      userId: mockQualityManager.id,
      username: mockQualityManager.username,
      roles: mockQualityManager.roles,
    }).token;

    operatorToken = TokenService.signAccessToken({
      userId: mockOperator.id,
      username: mockOperator.username,
      roles: mockOperator.roles,
    }).token;
  });

  describe('Authentication & Catalog Endpoint', () => {
    it('rejects unauthenticated requests to report catalog with 401', async () => {
      const res = await request(app).get('/api/v1/reports');
      expect(res.status).toBe(401);
    });

    it('returns report catalog with 5 supported report types and formats', async () => {
      const res = await request(app)
        .get('/api/v1/reports')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.reports).toHaveLength(5);
      const types = (res.body.reports as Array<{ reportType: string }>).map((r) => r.reportType);
      expect(types).toContain('production-performance');
      expect(types).toContain('inspection-summary');
      expect(types).toContain('defect-analysis');
      expect(types).toContain('capa-status');
      expect(types).toContain('spc-summary');
    });
  });

  describe('Report Queries (JSON API)', () => {
    it('returns production-performance report data', async () => {
      vi.spyOn(reportsRepository, 'getProductionPerformanceReport').mockResolvedValue({
        reportType: 'production-performance',
        generatedAt: new Date().toISOString(),
        filters: {},
        summary: {
          totalBatches: 10,
          batchesByStatus: { COMPLETED: 8, IN_PROGRESS: 2 },
          totalPlannedQuantity: 1000,
          totalProducedQuantity: 1000,
          totalAcceptedQuantity: 950,
          totalScrapQuantity: 50,
          totalReworkPendingQuantity: 0,
          overallScrapRate: 0.05,
          totalDowntimeEvents: 2,
          totalDowntimeDurationSeconds: 1800,
        },
        rows: [],
      });

      const res = await request(app)
        .get(
          '/api/v1/reports/production-performance?from=2026-01-01T00:00:00.000Z&to=2026-01-31T00:00:00.000Z',
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.report.reportType).toBe('production-performance');
      expect(res.body.report.summary.totalBatches).toBe(10);
      expect(res.body.report.summary.overallScrapRate).toBe(0.05);
    });

    it('returns inspection-summary report data with pooled failure proportion', async () => {
      vi.spyOn(reportsRepository, 'getInspectionSummaryReport').mockResolvedValue({
        reportType: 'inspection-summary',
        generatedAt: new Date().toISOString(),
        filters: {},
        summary: {
          totalInspections: 25,
          completedInspections: 20,
          inProgressInspections: 4,
          cancelledInspections: 1,
          totalSampleUnits: 1000,
          totalPassedUnits: 960,
          totalFailedUnits: 40,
          pooledFailureProportion: 0.04,
          stageBreakdown: { FINAL: 20 },
          resultBreakdown: { PASS: 18, FAIL: 2 },
        },
        rows: [],
      });

      const res = await request(app)
        .get(
          '/api/v1/reports/inspection-summary?from=2026-01-01T00:00:00.000Z&to=2026-01-31T00:00:00.000Z',
        )
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.report.reportType).toBe('inspection-summary');
      expect(res.body.report.summary.completedInspections).toBe(20);
      expect(res.body.report.summary.pooledFailureProportion).toBe(0.04);
    });

    it('returns spc-summary report delegating to spcService', async () => {
      vi.spyOn(spcService, 'getPChart').mockResolvedValue({
        status: 'READY',
        filters: {
          productId: '11111111-1111-1111-1111-111111111111',
          productionLineId: '22222222-2222-2222-2222-222222222222',
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-31T00:00:00.000Z',
        },
        baseline: {
          subgroupCount: 20,
          minimumRequired: 20,
          totalSampleSize: 1000,
          totalFailedUnits: 50,
          pBar: 0.05,
        },
        summary: {
          signalCount: 0,
          upperSignalCount: 0,
          lowerSignalCount: 0,
          interpretation: 'Process is in statistical control.',
        },
        points: [],
        warnings: [],
      });

      const res = await request(app)
        .get(
          '/api/v1/reports/spc-summary?productId=11111111-1111-1111-1111-111111111111&productionLineId=22222222-2222-2222-2222-222222222222&from=2026-01-01T00:00:00.000Z&to=2026-01-31T00:00:00.000Z',
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.report.reportType).toBe('spc-summary');
      expect(res.body.report.spcResponse.status).toBe('READY');
      expect(res.body.report.spcResponse.baseline.pBar).toBe(0.05);
    });

    it('rejects invalid date range (from > to) with 400', async () => {
      const res = await request(app)
        .get(
          '/api/v1/reports/production-performance?from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z',
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('chronologically later than');
    });

    it('rejects date range exceeding 366 days with 400', async () => {
      const res = await request(app)
        .get(
          '/api/v1/reports/production-performance?from=2024-01-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z',
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Date range cannot exceed 366 days');
    });
  });

  describe('Export Downloads (CSV, XLSX, PDF)', () => {
    beforeEach(() => {
      vi.spyOn(reportsRepository, 'getProductionPerformanceReport').mockResolvedValue({
        reportType: 'production-performance',
        generatedAt: new Date().toISOString(),
        filters: {},
        summary: {
          totalBatches: 2,
          batchesByStatus: { COMPLETED: 2 },
          totalPlannedQuantity: 200,
          totalProducedQuantity: 200,
          totalAcceptedQuantity: 190,
          totalScrapQuantity: 10,
          totalReworkPendingQuantity: 0,
          overallScrapRate: 0.05,
          totalDowntimeEvents: 0,
          totalDowntimeDurationSeconds: 0,
        },
        rows: [
          {
            batchId: '11111111-1111-1111-1111-111111111111',
            batchNumber: '=cmd|’ /C calc’!A0', // Potential formula injection cell
            productCode: '+PRD-01', // Potential formula injection cell
            productName: 'Widget Alpha',
            productionLineCode: 'LINE-01',
            productionLineName: 'Assembly Line 1',
            status: 'COMPLETED',
            plannedQuantity: 100,
            producedQuantity: 100,
            acceptedQuantity: 95,
            scrapQuantity: 5,
            reworkPendingQuantity: 0,
            startedAt: '2026-01-01T08:00:00.000Z',
            completedAt: '2026-01-01T16:00:00.000Z',
          },
        ],
      });
    });

    it('exports CSV with sanitized formula injection characters and correct headers', async () => {
      const res = await request(app)
        .get(
          '/api/v1/reports/production-performance/export?format=csv&from=2026-01-01T00:00:00.000Z&to=2026-01-31T00:00:00.000Z',
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(
        'attachment; filename="qualityops-production-performance-',
      );

      // Verify formula injection sanitization: dangerous leading '=' and '+' must be prefixed with single quote
      const csvBody = res.text;
      expect(csvBody).toContain('Batch Number');
      expect(csvBody).toContain("'=cmd|’ /C calc’!A0");
      expect(csvBody).toContain("'+PRD-01");
    });

    it('exports XLSX with application/vnd.openxmlformats content-type', async () => {
      const res = await request(app)
        .get(
          '/api/v1/reports/production-performance/export?format=xlsx&from=2026-01-01T00:00:00.000Z&to=2026-01-31T00:00:00.000Z',
        )
        .responseType('blob')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats');
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(100);
    });

    it('exports PDF with application/pdf content-type', async () => {
      const res = await request(app)
        .get(
          '/api/v1/reports/production-performance/export?format=pdf&from=2026-01-01T00:00:00.000Z&to=2026-01-31T00:00:00.000Z',
        )
        .responseType('blob')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(100);
    });
  });

  describe('Scheduled Reports Management & RBAC', () => {
    it('restricts schedule creation to ADMIN and QUALITY_MANAGER roles', async () => {
      const schedulePayload = {
        name: 'Weekly Quality Review',
        reportType: 'inspection-summary',
        filters: {},
        format: 'PDF',
        cadence: 'WEEKLY',
      };

      // OPERATOR must receive 403 Forbidden
      const operatorRes = await request(app)
        .post('/api/v1/reports/schedules')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(schedulePayload);
      expect(operatorRes.status).toBe(403);

      // QUALITY_MANAGER is authorized
      vi.spyOn(reportsRepository, 'getInspectionSummaryReport').mockResolvedValue({
        reportType: 'inspection-summary',
        generatedAt: new Date().toISOString(),
        filters: {},
        summary: {
          totalInspections: 0,
          completedInspections: 0,
          inProgressInspections: 0,
          cancelledInspections: 0,
          totalSampleUnits: 0,
          totalPassedUnits: 0,
          totalFailedUnits: 0,
          pooledFailureProportion: null,
          stageBreakdown: {},
          resultBreakdown: {},
        },
        rows: [],
      });

      vi.spyOn(schedulesRepository, 'createSchedule').mockResolvedValue({
        id: '99999999-9999-9999-9999-999999999999',
        name: 'Weekly Quality Review',
        reportType: 'inspection-summary',
        filters: {},
        format: 'PDF',
        cadence: 'WEEKLY',
        timezone: 'UTC',
        isEnabled: true,
        createdBy: mockQualityManager.id,
        nextRunAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        lastRunAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const qmRes = await request(app)
        .post('/api/v1/reports/schedules')
        .set('Authorization', `Bearer ${qmToken}`)
        .send(schedulePayload);
      expect(qmRes.status).toBe(201);
      expect(qmRes.body.schedule.name).toBe('Weekly Quality Review');
    });

    it('lists schedules and run history for authorized users', async () => {
      vi.spyOn(schedulesRepository, 'listSchedules').mockResolvedValue([]);
      const listRes = await request(app)
        .get('/api/v1/reports/schedules')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.schedules).toEqual([]);
    });
  });

  describe('Artifact Download & Security', () => {
    it('rejects path traversal attempts in artifactId with 400', async () => {
      const res = await request(app)
        .get('/api/v1/reports/artifacts/..%2F..%2Fetc%2Fpasswd?format=PDF')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Invalid artifact identifier format; UUID required');
    });

    it('returns 404 for missing artifact', async () => {
      const res = await request(app)
        .get('/api/v1/reports/artifacts/00000000-0000-0000-0000-000000000000?format=PDF')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('not found or expired');
    });
  });
});
