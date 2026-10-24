import { productionLinesRepository, toProductionLineDto } from './production-lines.repository.js';
import { auditService } from '../../audit/audit.service.js';
import { ConflictError, NotFoundError } from '../../../middleware/error.middleware.js';
import type {
  CreateProductionLineRequest,
  ProductionLine,
  ProductionLineListQuery,
  ProductionLineListResponse,
  UpdateProductionLineRequest,
} from '@qualityops/contracts';
import type { AuditContext } from '../products/products.service.js';

export class ProductionLinesService {
  public async list(query: ProductionLineListQuery): Promise<ProductionLineListResponse> {
    const { items, total } = await productionLinesRepository.list(query);
    const totalPages = Math.ceil(total / query.limit);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    };
  }

  public async getById(id: string): Promise<ProductionLine> {
    const row = await productionLinesRepository.findById(id);
    if (!row) {
      throw new NotFoundError(`Production line not found: ${id}`);
    }
    return toProductionLineDto(row);
  }

  public async create(
    data: CreateProductionLineRequest,
    audit?: AuditContext,
  ): Promise<ProductionLine> {
    const existing = await productionLinesRepository.findByCode(data.code);
    if (existing) {
      throw new ConflictError(`Production line with code '${data.code}' already exists`);
    }

    try {
      const created = await productionLinesRepository.create({
        code: data.code,
        name: data.name,
        location: data.location,
        isActive: data.isActive,
      });

      const dto = toProductionLineDto(created);

      await auditService.record({
        actorId: audit?.actorId,
        action: 'CREATE',
        entityType: 'PRODUCTION_LINE',
        entityId: created.id,
        requestId: audit?.requestId,
        afterState: dto as unknown as Record<string, unknown>,
        ipAddress: audit?.ipAddress,
      });

      return dto;
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        throw new ConflictError(`Production line with code '${data.code}' already exists`);
      }
      throw err;
    }
  }

  public async update(
    id: string,
    updates: UpdateProductionLineRequest,
    audit?: AuditContext,
  ): Promise<ProductionLine> {
    const existing = await productionLinesRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Production line not found: ${id}`);
    }

    if (updates.code && updates.code !== existing.code) {
      const duplicate = await productionLinesRepository.findByCode(updates.code);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError(`Production line with code '${updates.code}' already exists`);
      }
    }

    try {
      const updated = await productionLinesRepository.update(id, updates);
      const beforeDto = toProductionLineDto(existing);
      const afterDto = toProductionLineDto(updated);

      const action =
        updates.isActive === false && existing.is_active === true ? 'DEACTIVATE' : 'UPDATE';

      await auditService.record({
        actorId: audit?.actorId,
        action,
        entityType: 'PRODUCTION_LINE',
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
        throw new ConflictError(`Production line with code '${updates.code}' already exists`);
      }
      throw err;
    }
  }

  public async delete(id: string, audit?: AuditContext): Promise<void> {
    const existing = await productionLinesRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Production line not found: ${id}`);
    }

    try {
      await productionLinesRepository.delete(id);
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23503') {
        throw new ConflictError(
          'Cannot delete production line because it is referenced by existing machines or production batches. Deactivate it instead.',
        );
      }
      throw err;
    }

    await auditService.record({
      actorId: audit?.actorId,
      action: 'DELETE',
      entityType: 'PRODUCTION_LINE',
      entityId: id,
      requestId: audit?.requestId,
      beforeState: toProductionLineDto(existing) as unknown as Record<string, unknown>,
      ipAddress: audit?.ipAddress,
    });
  }
}

export const productionLinesService = new ProductionLinesService();
