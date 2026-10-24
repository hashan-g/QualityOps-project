import { defectTypesRepository, toDefectTypeDto } from './defect-types.repository.js';
import { auditService } from '../../audit/audit.service.js';
import { ConflictError, NotFoundError } from '../../../middleware/error.middleware.js';
import type {
  CreateDefectTypeRequest,
  DefectType,
  DefectTypeListQuery,
  DefectTypeListResponse,
  UpdateDefectTypeRequest,
} from '@qualityops/contracts';
import type { AuditContext } from '../products/products.service.js';

export class DefectTypesService {
  public async list(query: DefectTypeListQuery): Promise<DefectTypeListResponse> {
    const { items, total } = await defectTypesRepository.list(query);
    const totalPages = Math.ceil(total / query.limit);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    };
  }

  public async getById(id: string): Promise<DefectType> {
    const row = await defectTypesRepository.findById(id);
    if (!row) {
      throw new NotFoundError(`Defect type not found: ${id}`);
    }
    return toDefectTypeDto(row);
  }

  public async create(data: CreateDefectTypeRequest, audit?: AuditContext): Promise<DefectType> {
    const existing = await defectTypesRepository.findByCode(data.code);
    if (existing) {
      throw new ConflictError(`Defect type with code '${data.code}' already exists`);
    }

    try {
      const created = await defectTypesRepository.create({
        code: data.code,
        name: data.name,
        category: data.category,
        severity: data.severity,
        isActive: data.isActive,
      });

      const dto = toDefectTypeDto(created);

      await auditService.record({
        actorId: audit?.actorId,
        action: 'CREATE',
        entityType: 'DEFECT_TYPE',
        entityId: created.id,
        requestId: audit?.requestId,
        afterState: dto as unknown as Record<string, unknown>,
        ipAddress: audit?.ipAddress,
      });

      return dto;
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        throw new ConflictError(`Defect type with code '${data.code}' already exists`);
      }
      throw err;
    }
  }

  public async update(
    id: string,
    updates: UpdateDefectTypeRequest,
    audit?: AuditContext,
  ): Promise<DefectType> {
    const existing = await defectTypesRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Defect type not found: ${id}`);
    }

    if (updates.code && updates.code !== existing.code) {
      const duplicate = await defectTypesRepository.findByCode(updates.code);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError(`Defect type with code '${updates.code}' already exists`);
      }
    }

    try {
      const updated = await defectTypesRepository.update(id, updates);
      const beforeDto = toDefectTypeDto(existing);
      const afterDto = toDefectTypeDto(updated);

      const action =
        updates.isActive === false && existing.is_active === true ? 'DEACTIVATE' : 'UPDATE';

      await auditService.record({
        actorId: audit?.actorId,
        action,
        entityType: 'DEFECT_TYPE',
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
        throw new ConflictError(`Defect type with code '${updates.code}' already exists`);
      }
      throw err;
    }
  }

  public async delete(id: string, audit?: AuditContext): Promise<void> {
    const existing = await defectTypesRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Defect type not found: ${id}`);
    }

    try {
      await defectTypesRepository.delete(id);
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23503') {
        throw new ConflictError(
          'Cannot delete defect type because it is referenced by existing defect records. Deactivate it instead.',
        );
      }
      throw err;
    }

    await auditService.record({
      actorId: audit?.actorId,
      action: 'DELETE',
      entityType: 'DEFECT_TYPE',
      entityId: id,
      requestId: audit?.requestId,
      beforeState: toDefectTypeDto(existing) as unknown as Record<string, unknown>,
      ipAddress: audit?.ipAddress,
    });
  }
}

export const defectTypesService = new DefectTypesService();
