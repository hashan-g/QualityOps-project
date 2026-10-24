import { batchesRepository, toProductionBatchDto } from './batches.repository.js';
import { productsRepository } from '../../master-data/products/products.repository.js';
import { productionLinesRepository } from '../../master-data/production-lines/production-lines.repository.js';
import { shiftsRepository } from '../../master-data/shifts/shifts.repository.js';
import { machinesRepository } from '../../master-data/machines/machines.repository.js';
import { auditService } from '../../audit/audit.service.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../middleware/error.middleware.js';
import type {
  BatchStatus,
  CreateProductionBatchRequest,
  ProductionBatch,
  ProductionBatchListQuery,
  ProductionBatchListResponse,
  UpdateProductionBatchRequest,
} from '@qualityops/contracts';
import type { AuditContext } from '../../master-data/products/products.service.js';

export class BatchesService {
  public async list(query: ProductionBatchListQuery): Promise<ProductionBatchListResponse> {
    const { items, total } = await batchesRepository.list(query);
    const totalPages = Math.ceil(total / query.limit);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    };
  }

  public async getById(id: string): Promise<ProductionBatch> {
    const row = await batchesRepository.findById(id);
    if (!row) {
      throw new NotFoundError(`Production batch not found: ${id}`);
    }
    return toProductionBatchDto(row);
  }

  public async create(
    data: CreateProductionBatchRequest,
    audit?: AuditContext,
  ): Promise<ProductionBatch> {
    // 1. Check duplicate batch number
    const existing = await batchesRepository.findByBatchNumber(data.batchNumber);
    if (existing) {
      throw new ConflictError(`Batch with number '${data.batchNumber}' already exists`);
    }

    // 2. Validate product exists and is active
    const product = await productsRepository.findById(data.productId);
    if (!product) {
      throw new BadRequestError(`Referenced product not found: ${data.productId}`);
    }
    if (!product.is_active) {
      throw new BadRequestError(`Cannot schedule batch for inactive product: ${product.code}`);
    }

    // 3. Validate production line exists and is active
    const line = await productionLinesRepository.findById(data.productionLineId);
    if (!line) {
      throw new BadRequestError(`Referenced production line not found: ${data.productionLineId}`);
    }
    if (!line.is_active) {
      throw new BadRequestError(`Cannot schedule batch for inactive production line: ${line.code}`);
    }

    // 4. Validate shift exists and is active
    const shift = await shiftsRepository.findById(data.shiftId);
    if (!shift) {
      throw new BadRequestError(`Referenced shift not found: ${data.shiftId}`);
    }
    if (!shift.is_active) {
      throw new BadRequestError(`Cannot schedule batch for inactive shift: ${shift.code}`);
    }

    // 5. Validate machine (if assigned)
    if (data.machineId) {
      const machine = await machinesRepository.findById(data.machineId);
      if (!machine) {
        throw new BadRequestError(`Referenced machine not found: ${data.machineId}`);
      }
      if (!machine.is_active) {
        throw new BadRequestError(`Cannot assign inactive machine: ${machine.code}`);
      }
      if (machine.production_line_id !== data.productionLineId) {
        throw new BadRequestError(
          `Machine '${machine.code}' does not belong to production line '${line.code}'`,
        );
      }
    }

    // 6. StartedAt defaults
    let startedAt = data.startedAt;
    if (data.status === 'IN_PROGRESS' && !startedAt) {
      startedAt = new Date().toISOString();
    }

    try {
      const created = await batchesRepository.create({
        batchNumber: data.batchNumber,
        productId: data.productId,
        productionLineId: data.productionLineId,
        shiftId: data.shiftId,
        machineId: data.machineId,
        createdBy: audit?.actorId,
        plannedQuantity: data.plannedQuantity,
        status: data.status ?? 'PLANNED',
        startedAt,
      });

      const dto = toProductionBatchDto(created);

      await auditService.record({
        actorId: audit?.actorId,
        action: 'CREATE',
        entityType: 'PRODUCTION_BATCH',
        entityId: created.id,
        requestId: audit?.requestId,
        afterState: dto as unknown as Record<string, unknown>,
        ipAddress: audit?.ipAddress,
      });

      return dto;
    } catch (err: unknown) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === '23505') {
        throw new ConflictError(`Batch with number '${data.batchNumber}' already exists`);
      }
      throw err;
    }
  }

  public async update(
    id: string,
    updates: UpdateProductionBatchRequest,
    audit?: AuditContext,
  ): Promise<ProductionBatch> {
    const existing = await batchesRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Production batch not found: ${id}`);
    }

    // Terminal state protection
    if (existing.status === 'CANCELLED') {
      throw new BadRequestError('Cannot modify a cancelled production batch');
    }

    // Status transition validation
    if (updates.status && updates.status !== existing.status) {
      this.validateStatusTransition(existing.status, updates.status);
    }

    // Machine verification
    if (updates.machineId !== undefined) {
      if (updates.machineId !== null) {
        const machine = await machinesRepository.findById(updates.machineId);
        if (!machine) {
          throw new BadRequestError(`Machine not found: ${updates.machineId}`);
        }
        if (!machine.is_active) {
          throw new BadRequestError(`Cannot assign inactive machine: ${machine.code}`);
        }
        if (machine.production_line_id !== existing.production_line_id) {
          throw new BadRequestError(
            `Machine '${machine.code}' does not belong to production line for this batch`,
          );
        }
      }
    }

    // Automated timestamps on lifecycle transitions
    let startedAt = updates.startedAt;
    if (
      updates.status === 'IN_PROGRESS' &&
      existing.status === 'PLANNED' &&
      !existing.started_at &&
      !startedAt
    ) {
      startedAt = new Date().toISOString();
    }

    let completedAt = updates.completedAt;
    if (updates.status === 'COMPLETED' && !existing.completed_at && !completedAt) {
      completedAt = new Date().toISOString();
    }

    // Quantity calculations & check constraint enforcement
    const effectiveProduced = updates.producedQuantity ?? existing.produced_quantity;
    const effectiveAccepted = updates.acceptedQuantity ?? existing.accepted_quantity;
    const effectiveScrap = updates.scrapQuantity ?? existing.scrap_quantity;
    const effectiveRework = updates.reworkPendingQuantity ?? existing.rework_pending_quantity;
    const targetStatus = updates.status ?? existing.status;

    const dispositionSum = effectiveAccepted + effectiveScrap + effectiveRework;

    // Enforce chk_batch_disposition_sum
    if (dispositionSum > effectiveProduced) {
      throw new BadRequestError(
        `Disposition sum (${dispositionSum} = ${effectiveAccepted} accepted + ${effectiveScrap} scrap + ${effectiveRework} rework) cannot exceed produced quantity (${effectiveProduced})`,
      );
    }

    // Enforce chk_batch_completed_reconciled
    if (targetStatus === 'COMPLETED' && dispositionSum !== effectiveProduced) {
      throw new BadRequestError(
        `Completed batches must be fully reconciled: disposition sum (${dispositionSum}) must exactly equal produced quantity (${effectiveProduced})`,
      );
    }

    // Enforce timestamp ordering chk_batch_completed_after_started
    const effectiveStarted =
      startedAt !== undefined ? (startedAt ? new Date(startedAt) : null) : existing.started_at;
    const effectiveCompleted =
      completedAt !== undefined
        ? completedAt
          ? new Date(completedAt)
          : null
        : existing.completed_at;

    if (effectiveStarted && effectiveCompleted && effectiveCompleted < effectiveStarted) {
      throw new BadRequestError('Completed timestamp cannot be earlier than started timestamp');
    }

    try {
      const updated = await batchesRepository.update(id, {
        machineId: updates.machineId,
        producedQuantity: updates.producedQuantity,
        acceptedQuantity: updates.acceptedQuantity,
        scrapQuantity: updates.scrapQuantity,
        reworkPendingQuantity: updates.reworkPendingQuantity,
        status: updates.status,
        startedAt,
        completedAt,
      });

      const beforeDto = toProductionBatchDto(existing);
      const afterDto = toProductionBatchDto(updated);

      const action =
        updates.status && updates.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE';

      await auditService.record({
        actorId: audit?.actorId,
        action,
        entityType: 'PRODUCTION_BATCH',
        entityId: updated.id,
        requestId: audit?.requestId,
        beforeState: beforeDto as unknown as Record<string, unknown>,
        afterState: afterDto as unknown as Record<string, unknown>,
        ipAddress: audit?.ipAddress,
      });

      return afterDto;
    } catch (err: unknown) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === '23514') {
        if (pgErr.constraint === 'chk_batch_disposition_sum') {
          throw new BadRequestError('Total disposition cannot exceed produced quantity');
        }
        if (pgErr.constraint === 'chk_batch_completed_reconciled') {
          throw new BadRequestError('Completed batch must be fully reconciled');
        }
        if (pgErr.constraint === 'chk_batch_completed_after_started') {
          throw new BadRequestError('Completed time must be after started time');
        }
      }
      throw err;
    }
  }

  private validateStatusTransition(current: BatchStatus, next: BatchStatus): void {
    const allowedTransitions: Record<BatchStatus, BatchStatus[]> = {
      PLANNED: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
      ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
      COMPLETED: [], // Terminal
      CANCELLED: [], // Terminal
    };

    const allowed = allowedTransitions[current] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestError(
        `Invalid status transition from '${current}' to '${next}'. Allowed transitions: [${allowed.join(
          ', ',
        )}]`,
      );
    }
  }
}

export const batchesService = new BatchesService();
