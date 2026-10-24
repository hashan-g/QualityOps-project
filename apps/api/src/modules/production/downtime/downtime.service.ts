import { downtimeRepository, toDowntimeDto } from './downtime.repository.js';
import { productionLinesRepository } from '../../master-data/production-lines/production-lines.repository.js';
import { machinesRepository } from '../../master-data/machines/machines.repository.js';
import { batchesRepository } from '../batches/batches.repository.js';
import { auditService } from '../../audit/audit.service.js';
import { BadRequestError, NotFoundError } from '../../../middleware/error.middleware.js';
import type {
  CloseDowntimeRequest,
  CreateDowntimeRequest,
  DowntimeListQuery,
  DowntimeListResponse,
  DowntimeRecord,
  UpdateDowntimeRequest,
} from '@qualityops/contracts';
import type { AuditContext } from '../../master-data/products/products.service.js';

export class DowntimeService {
  public async list(query: DowntimeListQuery): Promise<DowntimeListResponse> {
    const { items, total } = await downtimeRepository.list(query);
    const totalPages = Math.ceil(total / query.limit);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    };
  }

  public async getById(id: string): Promise<DowntimeRecord> {
    const row = await downtimeRepository.findById(id);
    if (!row) {
      throw new NotFoundError(`Downtime record not found: ${id}`);
    }
    return toDowntimeDto(row);
  }

  public async create(data: CreateDowntimeRequest, audit?: AuditContext): Promise<DowntimeRecord> {
    // 1. Verify production line exists
    const line = await productionLinesRepository.findById(data.productionLineId);
    if (!line) {
      throw new BadRequestError(`Referenced production line not found: ${data.productionLineId}`);
    }

    // 2. Verify machine exists and belongs to the production line
    if (data.machineId) {
      const machine = await machinesRepository.findById(data.machineId);
      if (!machine) {
        throw new BadRequestError(`Referenced machine not found: ${data.machineId}`);
      }
      if (machine.production_line_id !== data.productionLineId) {
        throw new BadRequestError(
          `Machine '${machine.code}' does not belong to production line '${line.code}'`,
        );
      }
    }

    // 3. Verify batch (if linked) exists and belongs to the production line
    if (data.batchId) {
      const batch = await batchesRepository.findById(data.batchId);
      if (!batch) {
        throw new BadRequestError(`Referenced production batch not found: ${data.batchId}`);
      }
      if (batch.production_line_id !== data.productionLineId) {
        throw new BadRequestError(
          `Production batch '${batch.batch_number}' does not belong to production line '${line.code}'`,
        );
      }
    }

    // 4. Verify timestamp constraint chk_downtime_ended_after_started
    if (data.endedAt) {
      const start = new Date(data.startedAt);
      const end = new Date(data.endedAt);
      if (end <= start) {
        throw new BadRequestError('Downtime end time must be strictly after start time');
      }
    }

    try {
      const created = await downtimeRepository.create({
        productionLineId: data.productionLineId,
        machineId: data.machineId,
        batchId: data.batchId,
        reason: data.reason,
        category: data.category ?? 'UNPLANNED',
        startedAt: data.startedAt,
        endedAt: data.endedAt,
        recordedBy: audit?.actorId,
        notes: data.notes,
      });

      const dto = toDowntimeDto(created);

      await auditService.record({
        actorId: audit?.actorId,
        action: 'CREATE',
        entityType: 'DOWNTIME_RECORD',
        entityId: created.id,
        requestId: audit?.requestId,
        afterState: dto as unknown as Record<string, unknown>,
        ipAddress: audit?.ipAddress,
      });

      return dto;
    } catch (err: unknown) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === '23514' && pgErr.constraint === 'chk_downtime_ended_after_started') {
        throw new BadRequestError('Downtime end time must be strictly after start time');
      }
      throw err;
    }
  }

  public async close(
    id: string,
    data: CloseDowntimeRequest,
    audit?: AuditContext,
  ): Promise<DowntimeRecord> {
    const existing = await downtimeRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Downtime record not found: ${id}`);
    }

    if (existing.ended_at !== null) {
      throw new BadRequestError('Downtime event is already closed');
    }

    const end = new Date(data.endedAt);
    if (end <= existing.started_at) {
      throw new BadRequestError(
        `Downtime end time (${data.endedAt}) must be strictly after start time (${existing.started_at.toISOString()})`,
      );
    }

    try {
      const updated = await downtimeRepository.update(id, {
        endedAt: data.endedAt,
        notes: data.notes ?? existing.notes ?? undefined,
      });

      const beforeDto = toDowntimeDto(existing);
      const afterDto = toDowntimeDto(updated);

      await auditService.record({
        actorId: audit?.actorId,
        action: 'CLOSE',
        entityType: 'DOWNTIME_RECORD',
        entityId: updated.id,
        requestId: audit?.requestId,
        beforeState: beforeDto as unknown as Record<string, unknown>,
        afterState: afterDto as unknown as Record<string, unknown>,
        ipAddress: audit?.ipAddress,
      });

      return afterDto;
    } catch (err: unknown) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === '23514' && pgErr.constraint === 'chk_downtime_ended_after_started') {
        throw new BadRequestError('Downtime end time must be strictly after start time');
      }
      throw err;
    }
  }

  public async update(
    id: string,
    updates: UpdateDowntimeRequest,
    audit?: AuditContext,
  ): Promise<DowntimeRecord> {
    const existing = await downtimeRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Downtime record not found: ${id}`);
    }

    if (updates.endedAt !== undefined && updates.endedAt !== null) {
      const end = new Date(updates.endedAt);
      if (end <= existing.started_at) {
        throw new BadRequestError('Downtime end time must be strictly after start time');
      }
    }

    try {
      const updated = await downtimeRepository.update(id, updates);
      const beforeDto = toDowntimeDto(existing);
      const afterDto = toDowntimeDto(updated);

      await auditService.record({
        actorId: audit?.actorId,
        action: 'UPDATE',
        entityType: 'DOWNTIME_RECORD',
        entityId: updated.id,
        requestId: audit?.requestId,
        beforeState: beforeDto as unknown as Record<string, unknown>,
        afterState: afterDto as unknown as Record<string, unknown>,
        ipAddress: audit?.ipAddress,
      });

      return afterDto;
    } catch (err: unknown) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === '23514' && pgErr.constraint === 'chk_downtime_ended_after_started') {
        throw new BadRequestError('Downtime end time must be strictly after start time');
      }
      throw err;
    }
  }
}

export const downtimeService = new DowntimeService();
