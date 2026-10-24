import { machinesRepository, toMachineDto } from './machines.repository.js';
import { productionLinesRepository } from '../production-lines/production-lines.repository.js';
import { auditService } from '../../audit/audit.service.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../middleware/error.middleware.js';
import type {
  CreateMachineRequest,
  Machine,
  MachineListQuery,
  MachineListResponse,
  UpdateMachineRequest,
} from '@qualityops/contracts';
import type { AuditContext } from '../products/products.service.js';

export class MachinesService {
  public async list(query: MachineListQuery): Promise<MachineListResponse> {
    const { items, total } = await machinesRepository.list(query);
    const totalPages = Math.ceil(total / query.limit);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    };
  }

  public async getById(id: string): Promise<Machine> {
    const row = await machinesRepository.findById(id);
    if (!row) {
      throw new NotFoundError(`Machine not found: ${id}`);
    }
    return toMachineDto(row);
  }

  public async create(data: CreateMachineRequest, audit?: AuditContext): Promise<Machine> {
    const existing = await machinesRepository.findByCode(data.code);
    if (existing) {
      throw new ConflictError(`Machine with code '${data.code}' already exists`);
    }

    const line = await productionLinesRepository.findById(data.productionLineId);
    if (!line) {
      throw new BadRequestError(`Production line not found: ${data.productionLineId}`);
    }

    try {
      const created = await machinesRepository.create({
        code: data.code,
        name: data.name,
        productionLineId: data.productionLineId,
        status: data.status,
        isActive: data.isActive,
      });

      const dto = toMachineDto(created);
      dto.productionLineName = line.name;

      await auditService.record({
        actorId: audit?.actorId,
        action: 'CREATE',
        entityType: 'MACHINE',
        entityId: created.id,
        requestId: audit?.requestId,
        afterState: dto as unknown as Record<string, unknown>,
        ipAddress: audit?.ipAddress,
      });

      return dto;
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        throw new ConflictError(`Machine with code '${data.code}' already exists`);
      }
      if (pgErr.code === '23503') {
        throw new BadRequestError(`Referenced production line not found: ${data.productionLineId}`);
      }
      throw err;
    }
  }

  public async update(
    id: string,
    updates: UpdateMachineRequest,
    audit?: AuditContext,
  ): Promise<Machine> {
    const existing = await machinesRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Machine not found: ${id}`);
    }

    if (updates.code && updates.code !== existing.code) {
      const duplicate = await machinesRepository.findByCode(updates.code);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError(`Machine with code '${updates.code}' already exists`);
      }
    }

    if (updates.productionLineId && updates.productionLineId !== existing.production_line_id) {
      const line = await productionLinesRepository.findById(updates.productionLineId);
      if (!line) {
        throw new BadRequestError(`Production line not found: ${updates.productionLineId}`);
      }
    }

    try {
      const updated = await machinesRepository.update(id, updates);
      const beforeDto = toMachineDto(existing);
      const afterDto = toMachineDto(updated);

      const action =
        updates.isActive === false && existing.is_active === true ? 'DEACTIVATE' : 'UPDATE';

      await auditService.record({
        actorId: audit?.actorId,
        action,
        entityType: 'MACHINE',
        entityId: updated.id,
        requestId: audit?.requestId,
        beforeState: beforeDto as unknown as Record<string, unknown>,
        afterState: afterDto as unknown as Record<string, unknown>,
        ipAddress: audit?.ipAddress,
      });

      return afterDto;
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        throw new ConflictError(`Machine with code '${updates.code}' already exists`);
      }
      if (pgErr.code === '23503') {
        throw new BadRequestError(
          `Referenced production line not found: ${updates.productionLineId}`,
        );
      }
      throw err;
    }
  }

  public async delete(id: string, audit?: AuditContext): Promise<void> {
    const existing = await machinesRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Machine not found: ${id}`);
    }

    try {
      await machinesRepository.delete(id);
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23503') {
        throw new ConflictError(
          'Cannot delete machine because it is referenced by existing production records. Deactivate it instead.',
        );
      }
      throw err;
    }

    await auditService.record({
      actorId: audit?.actorId,
      action: 'DELETE',
      entityType: 'MACHINE',
      entityId: id,
      requestId: audit?.requestId,
      beforeState: toMachineDto(existing) as unknown as Record<string, unknown>,
      ipAddress: audit?.ipAddress,
    });
  }
}

export const machinesService = new MachinesService();
