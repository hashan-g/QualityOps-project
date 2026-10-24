import { shiftsRepository, toShiftDto } from './shifts.repository.js';
import { auditService } from '../../audit/audit.service.js';
import { ConflictError, NotFoundError } from '../../../middleware/error.middleware.js';
import type {
  CreateShiftRequest,
  Shift,
  ShiftListQuery,
  ShiftListResponse,
  UpdateShiftRequest,
} from '@qualityops/contracts';
import type { AuditContext } from '../products/products.service.js';

export class ShiftsService {
  public async list(query: ShiftListQuery): Promise<ShiftListResponse> {
    const { items, total } = await shiftsRepository.list(query);
    const totalPages = Math.ceil(total / query.limit);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    };
  }

  public async getById(id: string): Promise<Shift> {
    const row = await shiftsRepository.findById(id);
    if (!row) {
      throw new NotFoundError(`Shift not found: ${id}`);
    }
    return toShiftDto(row);
  }

  public async create(data: CreateShiftRequest, audit?: AuditContext): Promise<Shift> {
    const existing = await shiftsRepository.findByCode(data.code);
    if (existing) {
      throw new ConflictError(`Shift with code '${data.code}' already exists`);
    }

    try {
      const created = await shiftsRepository.create({
        code: data.code,
        name: data.name,
        startTime: data.startTime,
        endTime: data.endTime,
        isActive: data.isActive,
      });

      const dto = toShiftDto(created);

      await auditService.record({
        actorId: audit?.actorId,
        action: 'CREATE',
        entityType: 'SHIFT',
        entityId: created.id,
        requestId: audit?.requestId,
        afterState: dto as unknown as Record<string, unknown>,
        ipAddress: audit?.ipAddress,
      });

      return dto;
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        throw new ConflictError(`Shift with code '${data.code}' already exists`);
      }
      throw err;
    }
  }

  public async update(
    id: string,
    updates: UpdateShiftRequest,
    audit?: AuditContext,
  ): Promise<Shift> {
    const existing = await shiftsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Shift not found: ${id}`);
    }

    if (updates.code && updates.code !== existing.code) {
      const duplicate = await shiftsRepository.findByCode(updates.code);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError(`Shift with code '${updates.code}' already exists`);
      }
    }

    try {
      const updated = await shiftsRepository.update(id, updates);
      const beforeDto = toShiftDto(existing);
      const afterDto = toShiftDto(updated);

      const action =
        updates.isActive === false && existing.is_active === true ? 'DEACTIVATE' : 'UPDATE';

      await auditService.record({
        actorId: audit?.actorId,
        action,
        entityType: 'SHIFT',
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
        throw new ConflictError(`Shift with code '${updates.code}' already exists`);
      }
      throw err;
    }
  }

  public async delete(id: string, audit?: AuditContext): Promise<void> {
    const existing = await shiftsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Shift not found: ${id}`);
    }

    try {
      await shiftsRepository.delete(id);
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23503') {
        throw new ConflictError(
          'Cannot delete shift because it is referenced by existing production batches. Deactivate it instead.',
        );
      }
      throw err;
    }

    await auditService.record({
      actorId: audit?.actorId,
      action: 'DELETE',
      entityType: 'SHIFT',
      entityId: id,
      requestId: audit?.requestId,
      beforeState: toShiftDto(existing) as unknown as Record<string, unknown>,
      ipAddress: audit?.ipAddress,
    });
  }
}

export const shiftsService = new ShiftsService();
