import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { TokenService } from '../infrastructure/security/token.service.js';
import { productsRepository } from '../modules/master-data/products/products.repository.js';
import { productionLinesRepository } from '../modules/master-data/production-lines/production-lines.repository.js';
import { machinesRepository } from '../modules/master-data/machines/machines.repository.js';
import { shiftsRepository } from '../modules/master-data/shifts/shifts.repository.js';
import { defectTypesRepository } from '../modules/master-data/defect-types/defect-types.repository.js';
import { auditService } from '../modules/audit/audit.service.js';

describe('Master Data Management API (/api/v1/master-data)', () => {
  const app = createApp();

  const adminUser = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'super_admin',
    email: 'admin@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Super Admin',
    is_active: true,
    created_at: new Date('2026-10-24T00:00:00Z'),
    updated_at: new Date('2026-10-24T00:00:00Z'),
    roles: ['ADMIN' as const],
  };

  const qmUser = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'quality_lead',
    email: 'qm@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Quality Lead',
    is_active: true,
    created_at: new Date('2026-10-24T00:00:00Z'),
    updated_at: new Date('2026-10-24T00:00:00Z'),
    roles: ['QUALITY_MANAGER' as const],
  };

  const operatorUser = {
    id: '33333333-3333-3333-3333-333333333333',
    username: 'operator_dan',
    email: 'operator@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Operator Dan',
    is_active: true,
    created_at: new Date('2026-10-24T00:00:00Z'),
    updated_at: new Date('2026-10-24T00:00:00Z'),
    roles: ['OPERATOR' as const],
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

  const operatorToken = TokenService.signAccessToken({
    userId: operatorUser.id,
    username: operatorUser.username,
    roles: operatorUser.roles,
  }).token;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication & Authorization Gateways', () => {
    const endpoints = [
      '/api/v1/master-data/products',
      '/api/v1/master-data/production-lines',
      '/api/v1/master-data/machines',
      '/api/v1/master-data/shifts',
      '/api/v1/master-data/defect-types',
    ];

    it.each(endpoints)('returns 401 Unauthorized for unauthenticated GET %s', async (url) => {
      const response = await request(app).get(url);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it.each(endpoints)('returns 401 Unauthorized for unauthenticated POST %s', async (url) => {
      const response = await request(app).post(url).send({});
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 Forbidden when an OPERATOR attempts to POST a product', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);

      const response = await request(app)
        .post('/api/v1/master-data/products')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          code: 'PRD-NEW-01',
          name: 'Unauthorized Product',
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 Forbidden when an OPERATOR attempts to PATCH a machine', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);

      const response = await request(app)
        .patch('/api/v1/master-data/machines/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ name: 'Renamed' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 Forbidden when an OPERATOR attempts to DELETE a shift', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);

      const response = await request(app)
        .delete('/api/v1/master-data/shifts/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('allows read access (GET) for OPERATOR role', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);
      vi.spyOn(productsRepository, 'list').mockResolvedValue({ items: [], total: 0 });

      const response = await request(app)
        .get('/api/v1/master-data/products')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]);
      expect(response.body.total).toBe(0);
    });
  });

  describe('Products Management (/api/v1/master-data/products)', () => {
    const mockProductRow = {
      id: 'a0000000-0000-0000-0000-000000000001',
      code: 'PRD-PUMP-001',
      name: 'Hydraulic Pump Assembly',
      description: 'Heavy industrial fluid pump',
      target_cycle_time_seconds: '45.50',
      is_active: true,
      created_at: new Date('2026-10-24T10:00:00Z'),
      updated_at: new Date('2026-10-24T10:00:00Z'),
    };

    it('lists products with pagination and search', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(productsRepository, 'list').mockResolvedValue({
        items: [
          {
            id: mockProductRow.id,
            code: mockProductRow.code,
            name: mockProductRow.name,
            description: mockProductRow.description,
            targetCycleTimeSeconds: 45.5,
            isActive: true,
            createdAt: mockProductRow.created_at.toISOString(),
            updatedAt: mockProductRow.updated_at.toISOString(),
          },
        ],
        total: 1,
      });

      const response = await request(app)
        .get('/api/v1/master-data/products?search=Pump&page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].code).toBe('PRD-PUMP-001');
      expect(response.body.total).toBe(1);
      expect(response.body.totalPages).toBe(1);
    });

    it('creates product as QUALITY_MANAGER and records audit log', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(qmUser);
      vi.spyOn(productsRepository, 'findByCode').mockResolvedValue(null);
      vi.spyOn(productsRepository, 'create').mockResolvedValue(mockProductRow);
      const auditSpy = vi.spyOn(auditService, 'record').mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/master-data/products')
        .set('Authorization', `Bearer ${qmToken}`)
        .send({
          code: 'PRD-PUMP-001',
          name: 'Hydraulic Pump Assembly',
          description: 'Heavy industrial fluid pump',
          targetCycleTimeSeconds: 45.5,
        });

      expect(response.status).toBe(201);
      expect(response.body.item.code).toBe('PRD-PUMP-001');
      expect(response.body.item.targetCycleTimeSeconds).toBe(45.5);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'PRODUCT',
          entityId: mockProductRow.id,
          actorId: qmUser.id,
        }),
      );
    });

    it('rejects duplicate product code with 409 Conflict without audit entry', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(productsRepository, 'findByCode').mockResolvedValue(mockProductRow);
      const auditSpy = vi.spyOn(auditService, 'record');

      const response = await request(app)
        .post('/api/v1/master-data/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'PRD-PUMP-001',
          name: 'Duplicate Pump',
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toContain('already exists');
      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('rejects product with non-positive cycle time with 400 Bad Request', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);

      const response = await request(app)
        .post('/api/v1/master-data/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'PRD-PUMP-002',
          name: 'Invalid Cycle Time Product',
          targetCycleTimeSeconds: -10,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('updates product and audits deactivation', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(mockProductRow);
      vi.spyOn(productsRepository, 'update').mockResolvedValue({
        ...mockProductRow,
        is_active: false,
      });
      const auditSpy = vi.spyOn(auditService, 'record').mockResolvedValue();

      const response = await request(app)
        .patch(`/api/v1/master-data/products/${mockProductRow.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.item.isActive).toBe(false);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEACTIVATE',
          entityType: 'PRODUCT',
          entityId: mockProductRow.id,
        }),
      );
    });

    it('returns 409 Conflict when deleting a referenced product', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(mockProductRow);
      const fkError = new Error(
        'update or delete on table "products" violates foreign key constraint',
      );
      (fkError as unknown as { code: string }).code = '23503';
      vi.spyOn(productsRepository, 'delete').mockRejectedValue(fkError);
      const auditSpy = vi.spyOn(auditService, 'record');

      const response = await request(app)
        .delete(`/api/v1/master-data/products/${mockProductRow.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(409);
      expect(response.body.error.message).toContain(
        'referenced by existing production batches. Deactivate it instead.',
      );
      expect(auditSpy).not.toHaveBeenCalled();
    });
  });

  describe('Machines Management (/api/v1/master-data/machines)', () => {
    const mockLineRow = {
      id: 'b0000000-0000-0000-0000-000000000001',
      code: 'LINE-01',
      name: 'Main Assembly Line',
      location: 'Building A, Floor 1',
      is_active: true,
      created_at: new Date('2026-10-24T10:00:00Z'),
      updated_at: new Date('2026-10-24T10:00:00Z'),
    };

    const mockMachineRow = {
      id: 'c0000000-0000-0000-0000-000000000001',
      code: 'MCH-CNC-001',
      name: 'CNC Milling Center 1',
      production_line_id: mockLineRow.id,
      production_line_name: mockLineRow.name,
      status: 'IDLE' as const,
      is_active: true,
      created_at: new Date('2026-10-24T10:00:00Z'),
      updated_at: new Date('2026-10-24T10:00:00Z'),
    };

    it('rejects machine creation when productionLineId does not exist', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(machinesRepository, 'findByCode').mockResolvedValue(null);
      vi.spyOn(productionLinesRepository, 'findById').mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/master-data/machines')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'MCH-CNC-002',
          name: 'CNC Milling Center 2',
          productionLineId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
          status: 'IDLE',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Production line not found');
    });

    it('creates machine when productionLineId is valid', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(machinesRepository, 'findByCode').mockResolvedValue(null);
      vi.spyOn(productionLinesRepository, 'findById').mockResolvedValue(mockLineRow);
      vi.spyOn(machinesRepository, 'create').mockResolvedValue(mockMachineRow);
      const auditSpy = vi.spyOn(auditService, 'record').mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/master-data/machines')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'MCH-CNC-001',
          name: 'CNC Milling Center 1',
          productionLineId: mockLineRow.id,
          status: 'IDLE',
        });

      expect(response.status).toBe(201);
      expect(response.body.item.code).toBe('MCH-CNC-001');
      expect(response.body.item.productionLineId).toBe(mockLineRow.id);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'MACHINE',
          entityId: mockMachineRow.id,
        }),
      );
    });
  });

  describe('Shifts Management (/api/v1/master-data/shifts)', () => {
    const mockShiftRow = {
      id: 'd0000000-0000-0000-0000-000000000001',
      code: 'SHF-MORNING',
      name: 'Morning Shift',
      start_time: '06:00:00',
      end_time: '14:00:00',
      is_active: true,
      created_at: new Date('2026-10-24T10:00:00Z'),
      updated_at: new Date('2026-10-24T10:00:00Z'),
    };

    it('lists shifts with pagination', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(shiftsRepository, 'list').mockResolvedValue({
        items: [
          {
            id: mockShiftRow.id,
            code: mockShiftRow.code,
            name: mockShiftRow.name,
            startTime: '06:00',
            endTime: '14:00',
            isActive: true,
            createdAt: mockShiftRow.created_at.toISOString(),
            updatedAt: mockShiftRow.updated_at.toISOString(),
          },
        ],
        total: 1,
      });

      const response = await request(app)
        .get('/api/v1/master-data/shifts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].code).toBe('SHF-MORNING');
    });

    it('validates 24-hour time format on shift creation', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);

      const response = await request(app)
        .post('/api/v1/master-data/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'SHF-INVALID',
          name: 'Invalid Shift',
          startTime: '25:00',
          endTime: '12:00',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('allows overnight shift creation (e.g. 22:00 to 06:00)', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(shiftsRepository, 'findByCode').mockResolvedValue(null);
      vi.spyOn(shiftsRepository, 'create').mockResolvedValue({
        id: 'd0000000-0000-0000-0000-000000000002',
        code: 'SHF-NIGHT',
        name: 'Night Shift',
        start_time: '22:00:00',
        end_time: '06:00:00',
        is_active: true,
        created_at: new Date('2026-10-24T10:00:00Z'),
        updated_at: new Date('2026-10-24T10:00:00Z'),
      });
      vi.spyOn(auditService, 'record').mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/master-data/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'SHF-NIGHT',
          name: 'Night Shift',
          startTime: '22:00',
          endTime: '06:00',
        });

      expect(response.status).toBe(201);
      expect(response.body.item.code).toBe('SHF-NIGHT');
      expect(response.body.item.startTime).toBe('22:00');
      expect(response.body.item.endTime).toBe('06:00');
    });
  });

  describe('Defect Types Management (/api/v1/master-data/defect-types)', () => {
    const mockDefectRow = {
      id: 'e0000000-0000-0000-0000-000000000001',
      code: 'DEF-SCRATCH-01',
      name: 'Surface Scratch',
      category: 'COSMETIC',
      severity: 'MINOR' as const,
      is_active: true,
      created_at: new Date('2026-10-24T10:00:00Z'),
      updated_at: new Date('2026-10-24T10:00:00Z'),
    };

    it('rejects invalid severity enum values', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);

      const response = await request(app)
        .post('/api/v1/master-data/defect-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'DEF-BAD-SEV',
          name: 'Bad Severity Defect',
          category: 'MECHANICAL',
          severity: 'SUPER_CRITICAL',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('creates defect type with valid severity and audits action', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(defectTypesRepository, 'findByCode').mockResolvedValue(null);
      vi.spyOn(defectTypesRepository, 'create').mockResolvedValue(mockDefectRow);
      const auditSpy = vi.spyOn(auditService, 'record').mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/master-data/defect-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'DEF-SCRATCH-01',
          name: 'Surface Scratch',
          category: 'COSMETIC',
          severity: 'MINOR',
        });

      expect(response.status).toBe(201);
      expect(response.body.item.code).toBe('DEF-SCRATCH-01');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'DEFECT_TYPE',
          entityId: mockDefectRow.id,
        }),
      );
    });
  });
});
