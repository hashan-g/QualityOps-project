import { productsRepository, toProductDto } from './products.repository.js';
import { auditService } from '../../audit/audit.service.js';
import { ConflictError, NotFoundError } from '../../../middleware/error.middleware.js';
import type {
  CreateProductRequest,
  Product,
  ProductListQuery,
  ProductListResponse,
  UpdateProductRequest,
} from '@qualityops/contracts';

export interface AuditContext {
  actorId?: string | undefined;
  requestId?: string | undefined;
  ipAddress?: string | undefined;
}

export class ProductsService {
  public async list(query: ProductListQuery): Promise<ProductListResponse> {
    const { items, total } = await productsRepository.list(query);
    const totalPages = Math.ceil(total / query.limit);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    };
  }

  public async getById(id: string): Promise<Product> {
    const row = await productsRepository.findById(id);
    if (!row) {
      throw new NotFoundError(`Product not found: ${id}`);
    }
    return toProductDto(row);
  }

  public async create(data: CreateProductRequest, audit?: AuditContext): Promise<Product> {
    const existing = await productsRepository.findByCode(data.code);
    if (existing) {
      throw new ConflictError(`Product with code '${data.code}' already exists`);
    }

    try {
      const created = await productsRepository.create({
        code: data.code,
        name: data.name,
        description: data.description,
        targetCycleTimeSeconds: data.targetCycleTimeSeconds,
        isActive: data.isActive,
      });

      const dto = toProductDto(created);

      await auditService.record({
        actorId: audit?.actorId,
        action: 'CREATE',
        entityType: 'PRODUCT',
        entityId: created.id,
        requestId: audit?.requestId,
        afterState: dto as unknown as Record<string, unknown>,
        ipAddress: audit?.ipAddress,
      });

      return dto;
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        throw new ConflictError(`Product with code '${data.code}' already exists`);
      }
      throw err;
    }
  }

  public async update(
    id: string,
    updates: UpdateProductRequest,
    audit?: AuditContext,
  ): Promise<Product> {
    const existing = await productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Product not found: ${id}`);
    }

    if (updates.code && updates.code !== existing.code) {
      const duplicate = await productsRepository.findByCode(updates.code);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError(`Product with code '${updates.code}' already exists`);
      }
    }

    try {
      const updated = await productsRepository.update(id, updates);
      const beforeDto = toProductDto(existing);
      const afterDto = toProductDto(updated);

      const action =
        updates.isActive === false && existing.is_active === true ? 'DEACTIVATE' : 'UPDATE';

      await auditService.record({
        actorId: audit?.actorId,
        action,
        entityType: 'PRODUCT',
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
        throw new ConflictError(`Product with code '${updates.code}' already exists`);
      }
      throw err;
    }
  }

  public async delete(id: string, audit?: AuditContext): Promise<void> {
    const existing = await productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Product not found: ${id}`);
    }

    try {
      await productsRepository.delete(id);
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23503') {
        throw new ConflictError(
          'Cannot delete product because it is referenced by existing production batches. Deactivate it instead.',
        );
      }
      throw err;
    }

    await auditService.record({
      actorId: audit?.actorId,
      action: 'DELETE',
      entityType: 'PRODUCT',
      entityId: id,
      requestId: audit?.requestId,
      beforeState: toProductDto(existing) as unknown as Record<string, unknown>,
      ipAddress: audit?.ipAddress,
    });
  }
}

export const productsService = new ProductsService();
