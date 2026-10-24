import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { TokenService } from '../infrastructure/security/token.service.js';
import { batchesRepository } from '../modules/production/batches/batches.repository.js';
import { downtimeRepository } from '../modules/production/downtime/downtime.repository.js';
import { productsRepository } from '../modules/master-data/products/products.repository.js';
import { productionLinesRepository } from '../modules/master-data/production-lines/production-lines.repository.js';
import { machinesRepository } from '../modules/master-data/machines/machines.repository.js';
import { shiftsRepository } from '../modules/master-data/shifts/shifts.repository.js';
import { auditService } from '../modules/audit/audit.service.js';

describe('Production Management API (/api/v1/production)', () => {
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

  const supervisorUser = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'shift_supervisor',
    email: 'supervisor@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Shift Supervisor',
    is_active: true,
    created_at: new Date('2026-10-24T00:00:00Z'),
    updated_at: new Date('2026-10-24T00:00:00Z'),
    roles: ['SUPERVISOR' as const],
  };

  const operatorUser = {
    id: '33333333-3333-3333-3333-333333333333',
    username: 'line_operator',
    email: 'operator@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Line Operator',
    is_active: true,
    created_at: new Date('2026-10-24T00:00:00Z'),
    updated_at: new Date('2026-10-24T00:00:00Z'),
    roles: ['OPERATOR' as const],
  };

  const viewerUser = {
    id: '44444444-4444-4444-4444-444444444444',
    username: 'viewer_auditor',
    email: 'viewer@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Auditor Viewer',
    is_active: true,
    created_at: new Date('2026-10-24T00:00:00Z'),
    updated_at: new Date('2026-10-24T00:00:00Z'),
    roles: ['VIEWER' as const],
  };

  const adminToken = TokenService.signAccessToken({
    userId: adminUser.id,
    username: adminUser.username,
    roles: adminUser.roles,
  }).token;

  const supervisorToken = TokenService.signAccessToken({
    userId: supervisorUser.id,
    username: supervisorUser.username,
    roles: supervisorUser.roles,
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

  const mockProduct = {
    id: 'a1111111-1111-1111-1111-111111111111',
    code: 'PRD-001',
    name: 'Precision Gearbox',
    description: null,
    target_cycle_time_seconds: '60.00',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockLine = {
    id: 'b1111111-1111-1111-1111-111111111111',
    code: 'LINE-01',
    name: 'Line 1',
    location: 'Building A',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockMachine = {
    id: 'c1111111-1111-1111-1111-111111111111',
    code: 'MCH-001',
    name: 'CNC Milling 1',
    production_line_id: mockLine.id,
    status: 'RUNNING' as const,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockShift = {
    id: 'd1111111-1111-1111-1111-111111111111',
    code: 'SHF-MORNING',
    name: 'Morning Shift',
    start_time: '08:00:00',
    end_time: '16:00:00',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockBatchRow = {
    id: 'e1111111-1111-1111-1111-111111111111',
    batch_number: 'BATCH-2026-001',
    product_id: mockProduct.id,
    product_code: mockProduct.code,
    product_name: mockProduct.name,
    production_line_id: mockLine.id,
    production_line_code: mockLine.code,
    production_line_name: mockLine.name,
    shift_id: mockShift.id,
    shift_code: mockShift.code,
    shift_name: mockShift.name,
    machine_id: mockMachine.id,
    machine_code: mockMachine.code,
    machine_name: mockMachine.name,
    created_by: adminUser.id,
    created_by_name: adminUser.full_name,
    status: 'PLANNED' as const,
    planned_quantity: 100,
    produced_quantity: 0,
    accepted_quantity: 0,
    scrap_quantity: 0,
    rework_pending_quantity: 0,
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-10-24T10:00:00Z'),
    updated_at: new Date('2026-10-24T10:00:00Z'),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication & Authorization Gateways', () => {
    it('returns 401 Unauthorized for unauthenticated GET and POST', async () => {
      const getRes = await request(app).get('/api/v1/production/batches');
      expect(getRes.status).toBe(401);
      expect(getRes.body.error.code).toBe('UNAUTHORIZED');

      const postRes = await request(app).post('/api/v1/production/batches').send({});
      expect(postRes.status).toBe(401);
    });

    it('returns 403 Forbidden when VIEWER attempts to create a batch', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(viewerUser);

      const res = await request(app)
        .post('/api/v1/production/batches')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          batchNumber: 'BATCH-FAIL',
          productId: mockProduct.id,
          productionLineId: mockLine.id,
          shiftId: mockShift.id,
          plannedQuantity: 100,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows read access for VIEWER role', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(viewerUser);
      vi.spyOn(batchesRepository, 'list').mockResolvedValue({ items: [], total: 0 });

      const res = await request(app)
        .get('/api/v1/production/batches')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    });

    it('returns 403 Forbidden when OPERATOR attempts to complete or cancel a batch', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);

      const res = await request(app)
        .patch(`/api/v1/production/batches/${mockBatchRow.id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Only ADMIN and SUPERVISOR roles are permitted');
    });

    it('allows SUPERVISOR to complete a batch', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(supervisorUser);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue({
        ...mockBatchRow,
        status: 'IN_PROGRESS',
        produced_quantity: 100,
        accepted_quantity: 90,
        scrap_quantity: 10,
        rework_pending_quantity: 0,
        started_at: new Date('2026-10-24T08:00:00Z'),
      });
      vi.spyOn(batchesRepository, 'update').mockResolvedValue({
        ...mockBatchRow,
        status: 'COMPLETED',
        produced_quantity: 100,
        accepted_quantity: 90,
        scrap_quantity: 10,
        completed_at: new Date('2026-10-24T16:00:00Z'),
      });
      const auditSpy = vi.spyOn(auditService, 'record').mockResolvedValue();

      const res = await request(app)
        .patch(`/api/v1/production/batches/${mockBatchRow.id}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(200);
      expect(res.body.item.status).toBe('COMPLETED');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
          entityType: 'PRODUCTION_BATCH',
        }),
      );
    });
  });

  describe('Production Batch Lifecycle & Validations', () => {
    it('creates batch with valid master data references as OPERATOR', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);
      vi.spyOn(batchesRepository, 'findByBatchNumber').mockResolvedValue(null);
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(mockProduct);
      vi.spyOn(productionLinesRepository, 'findById').mockResolvedValue(mockLine);
      vi.spyOn(shiftsRepository, 'findById').mockResolvedValue(mockShift);
      vi.spyOn(machinesRepository, 'findById').mockResolvedValue(mockMachine);
      vi.spyOn(batchesRepository, 'create').mockResolvedValue(mockBatchRow);
      const auditSpy = vi.spyOn(auditService, 'record').mockResolvedValue();

      const res = await request(app)
        .post('/api/v1/production/batches')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          batchNumber: 'BATCH-2026-001',
          productId: mockProduct.id,
          productionLineId: mockLine.id,
          shiftId: mockShift.id,
          machineId: mockMachine.id,
          plannedQuantity: 100,
        });

      expect(res.status).toBe(201);
      expect(res.body.item.batchNumber).toBe('BATCH-2026-001');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'PRODUCTION_BATCH',
          entityId: mockBatchRow.id,
        }),
      );
    });

    it('rejects batch creation when master data is inactive', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(batchesRepository, 'findByBatchNumber').mockResolvedValue(null);
      vi.spyOn(productsRepository, 'findById').mockResolvedValue({
        ...mockProduct,
        is_active: false,
      });

      const res = await request(app)
        .post('/api/v1/production/batches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          batchNumber: 'BATCH-INACTIVE',
          productId: mockProduct.id,
          productionLineId: mockLine.id,
          shiftId: mockShift.id,
          plannedQuantity: 50,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Cannot schedule batch for inactive product');
    });

    it('rejects batch creation when machine does not belong to production line', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(batchesRepository, 'findByBatchNumber').mockResolvedValue(null);
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(mockProduct);
      vi.spyOn(productionLinesRepository, 'findById').mockResolvedValue(mockLine);
      vi.spyOn(shiftsRepository, 'findById').mockResolvedValue(mockShift);
      vi.spyOn(machinesRepository, 'findById').mockResolvedValue({
        ...mockMachine,
        production_line_id: '99999999-9999-9999-9999-999999999999', // Different line
      });

      const res = await request(app)
        .post('/api/v1/production/batches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          batchNumber: 'BATCH-MISMATCH',
          productId: mockProduct.id,
          productionLineId: mockLine.id,
          shiftId: mockShift.id,
          machineId: mockMachine.id,
          plannedQuantity: 50,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('does not belong to production line');
    });

    it('rejects duplicate batch number with 409 Conflict', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(batchesRepository, 'findByBatchNumber').mockResolvedValue(mockBatchRow);

      const res = await request(app)
        .post('/api/v1/production/batches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          batchNumber: 'BATCH-2026-001',
          productId: mockProduct.id,
          productionLineId: mockLine.id,
          shiftId: mockShift.id,
          plannedQuantity: 100,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('enforces chk_batch_disposition_sum on quantity updates', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue({
        ...mockBatchRow,
        status: 'IN_PROGRESS',
        produced_quantity: 100,
      });

      // 80 accepted + 30 scrap = 110 > 100 produced -> MUST FAIL
      const res = await request(app)
        .patch(`/api/v1/production/batches/${mockBatchRow.id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          acceptedQuantity: 80,
          scrapQuantity: 30,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('cannot exceed produced quantity');
    });

    it('enforces chk_batch_completed_reconciled when transitioning to COMPLETED', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue({
        ...mockBatchRow,
        status: 'IN_PROGRESS',
        produced_quantity: 100,
        accepted_quantity: 80,
        scrap_quantity: 0,
        rework_pending_quantity: 0,
      });

      // 80 accepted + 0 scrap + 0 rework = 80 !== 100 produced -> MUST FAIL
      const res = await request(app)
        .patch(`/api/v1/production/batches/${mockBatchRow.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'COMPLETED',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('must exactly equal produced quantity');
    });

    it('rejects illegal status transition (e.g. COMPLETED -> PLANNED)', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue({
        ...mockBatchRow,
        status: 'COMPLETED',
      });

      const res = await request(app)
        .patch(`/api/v1/production/batches/${mockBatchRow.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'PLANNED',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain(
        "Invalid status transition from 'COMPLETED' to 'PLANNED'",
      );
    });

    it('rejects modification of a CANCELLED batch', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue({
        ...mockBatchRow,
        status: 'CANCELLED',
      });

      const res = await request(app)
        .patch(`/api/v1/production/batches/${mockBatchRow.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          producedQuantity: 50,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Cannot modify a cancelled production batch');
    });
  });

  describe('Downtime Events (/api/v1/production/downtime)', () => {
    const mockDowntimeRow = {
      id: 'f1111111-1111-1111-1111-111111111111',
      production_line_id: mockLine.id,
      production_line_code: mockLine.code,
      production_line_name: mockLine.name,
      machine_id: mockMachine.id,
      machine_code: mockMachine.code,
      machine_name: mockMachine.name,
      batch_id: mockBatchRow.id,
      batch_number: mockBatchRow.batch_number,
      reason: 'Coolant Pump Overheat',
      category: 'UNPLANNED' as const,
      started_at: new Date('2026-10-24T11:00:00Z'),
      ended_at: null,
      duration_seconds: null,
      recorded_by: operatorUser.id,
      recorded_by_name: operatorUser.full_name,
      notes: 'Alarm triggered on thermal sensor',
      created_at: new Date('2026-10-24T11:00:00Z'),
      updated_at: new Date('2026-10-24T11:00:00Z'),
    };

    it('creates downtime event as OPERATOR and audits creation', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);
      vi.spyOn(productionLinesRepository, 'findById').mockResolvedValue(mockLine);
      vi.spyOn(machinesRepository, 'findById').mockResolvedValue(mockMachine);
      vi.spyOn(batchesRepository, 'findById').mockResolvedValue(mockBatchRow);
      vi.spyOn(downtimeRepository, 'create').mockResolvedValue(mockDowntimeRow);
      const auditSpy = vi.spyOn(auditService, 'record').mockResolvedValue();

      const res = await request(app)
        .post('/api/v1/production/downtime')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          productionLineId: mockLine.id,
          machineId: mockMachine.id,
          batchId: mockBatchRow.id,
          reason: 'Coolant Pump Overheat',
          category: 'UNPLANNED',
          startedAt: '2026-10-24T11:00:00Z',
          notes: 'Alarm triggered on thermal sensor',
        });

      expect(res.status).toBe(201);
      expect(res.body.item.reason).toBe('Coolant Pump Overheat');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'DOWNTIME_RECORD',
          entityId: mockDowntimeRow.id,
        }),
      );
    });

    it('rejects downtime event with invalid endedAt <= startedAt', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);
      vi.spyOn(productionLinesRepository, 'findById').mockResolvedValue(mockLine);

      const res = await request(app)
        .post('/api/v1/production/downtime')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          productionLineId: mockLine.id,
          reason: 'Invalid Timing',
          startedAt: '2026-10-24T11:00:00Z',
          endedAt: '2026-10-24T10:00:00Z', // 1 hour earlier
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.error)).toContain(
        'Downtime end time must be strictly after start time',
      );
    });

    it('closes an ongoing downtime event and records duration', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);
      vi.spyOn(downtimeRepository, 'findById').mockResolvedValue(mockDowntimeRow);
      vi.spyOn(downtimeRepository, 'update').mockResolvedValue({
        ...mockDowntimeRow,
        ended_at: new Date('2026-10-24T11:30:00Z'),
        duration_seconds: 1800,
        notes: 'Pump replaced and primed',
      });
      const auditSpy = vi.spyOn(auditService, 'record').mockResolvedValue();

      const res = await request(app)
        .patch(`/api/v1/production/downtime/${mockDowntimeRow.id}/close`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          endedAt: '2026-10-24T11:30:00Z',
          notes: 'Pump replaced and primed',
        });

      expect(res.status).toBe(200);
      expect(res.body.item.durationSeconds).toBe(1800);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CLOSE',
          entityType: 'DOWNTIME_RECORD',
          entityId: mockDowntimeRow.id,
        }),
      );
    });

    it('rejects closing an already closed downtime event', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);
      vi.spyOn(downtimeRepository, 'findById').mockResolvedValue({
        ...mockDowntimeRow,
        ended_at: new Date('2026-10-24T11:30:00Z'),
        duration_seconds: 1800,
      });

      const res = await request(app)
        .patch(`/api/v1/production/downtime/${mockDowntimeRow.id}/close`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          endedAt: '2026-10-24T12:00:00Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Downtime event is already closed');
    });
  });
});
