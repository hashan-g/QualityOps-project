import { pool } from '../../../infrastructure/database/pool.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../middleware/error.middleware.js';
import { auditService } from '../../audit/audit.service.js';
import { batchesRepository } from '../../production/batches/batches.repository.js';
import { inspectionsRepository } from './inspections.repository.js';
import type {
  CreateInspectionRequest,
  InspectionListQuery,
  InspectionListResponse,
  QualityInspection,
  UpdateInspectionRequest,
} from '@qualityops/contracts';

export interface InspectionContext {
  actorId?: string | undefined;
  requestId?: string | undefined;
  ipAddress?: string | undefined;
}

export class InspectionsService {
  public async list(query: InspectionListQuery): Promise<InspectionListResponse> {
    return inspectionsRepository.list(query);
  }

  public async getById(id: string): Promise<QualityInspection> {
    const inspection = await inspectionsRepository.findById(id);
    if (!inspection) {
      throw new NotFoundError(`Quality inspection with ID ${id} not found`);
    }
    return inspection;
  }

  public async create(
    data: CreateInspectionRequest,
    context: InspectionContext,
  ): Promise<QualityInspection> {
    if (!context.actorId) {
      throw new BadRequestError('Inspector identity is required from authenticated session');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Verify batch exists and fetch produced quantity & status
      const batch = await batchesRepository.findById(data.batchId, client);
      if (!batch) {
        throw new NotFoundError(`Production batch with ID ${data.batchId} not found`);
      }

      // 2. Validate batch eligibility: IN_PROGRESS, ON_HOLD, COMPLETED
      const eligibleStatuses = ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED'];
      if (!eligibleStatuses.includes(batch.status)) {
        throw new BadRequestError(
          `Inspections cannot be performed on batches with status '${batch.status}'. Eligible batch statuses are: ${eligibleStatuses.join(', ')}.`,
        );
      }

      // 3. Validate single-inspection sample size vs batch produced quantity
      if (data.sampleSize > batch.produced_quantity) {
        throw new BadRequestError(
          `Sample size (${data.sampleSize}) cannot exceed the batch recorded produced quantity (${batch.produced_quantity}) at the time of inspection.`,
        );
      }

      // 4. Validate unit counts
      if (data.passedUnits + data.failedUnits > data.sampleSize) {
        throw new BadRequestError(
          `Sum of passed (${data.passedUnits}) and failed (${data.failedUnits}) units cannot exceed sample size (${data.sampleSize}).`,
        );
      }

      const status =
        data.status ??
        (data.passedUnits + data.failedUnits === data.sampleSize ? 'COMPLETED' : 'IN_PROGRESS');

      if (status === 'COMPLETED' && data.passedUnits + data.failedUnits !== data.sampleSize) {
        throw new BadRequestError(
          `Completed inspections must be fully classified: passed units (${data.passedUnits}) + failed units (${data.failedUnits}) must exactly equal sample size (${data.sampleSize}).`,
        );
      }

      // 5. Derive or validate result
      let derivedResult = data.result;
      if (!derivedResult) {
        derivedResult = data.failedUnits === 0 ? 'PASS' : 'FAIL';
      } else if (derivedResult === 'PASS' && data.failedUnits > 0) {
        throw new BadRequestError(
          `Inspection result cannot be PASS when ${data.failedUnits} failed units are recorded.`,
        );
      }

      // 6. Resolve attempt number and check uniqueness
      const attemptNumber =
        data.attemptNumber ??
        (await inspectionsRepository.getNextAttemptNumber(data.batchId, data.stage, client));

      const existingAttempt = await inspectionsRepository.findByBatchStageAttempt(
        data.batchId,
        data.stage,
        attemptNumber,
        client,
      );
      if (existingAttempt) {
        throw new ConflictError(
          `An inspection for batch ${data.batchId}, stage '${data.stage}', and attempt ${attemptNumber} already exists.`,
        );
      }

      // 7. Generate inspection number
      const inspectionNumber = await inspectionsRepository.generateInspectionNumber(client);

      // 8. Create inspection record
      const created = await inspectionsRepository.create(
        {
          inspectionNumber,
          batchId: data.batchId,
          inspectorId: context.actorId,
          stage: data.stage,
          attemptNumber,
          status,
          result: derivedResult,
          sampleSize: data.sampleSize,
          passedUnits: data.passedUnits,
          failedUnits: data.failedUnits,
          inspectedAt: data.inspectedAt,
          notes: data.notes ?? null,
        },
        client,
      );

      // 9. Atomic audit logging
      await auditService.record({
        client,
        actorId: context.actorId,
        action: 'CREATE',
        entityType: 'QUALITY_INSPECTION',
        entityId: created.id,
        afterState: created as unknown as Record<string, unknown>,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      });

      await client.query('COMMIT;');
      return created;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  public async correct(
    id: string,
    data: UpdateInspectionRequest,
    context: InspectionContext,
  ): Promise<QualityInspection> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      const existing = await inspectionsRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`Quality inspection with ID ${id} not found`);
      }

      const batch = await batchesRepository.findById(existing.batchId, client);
      if (!batch) {
        throw new NotFoundError(`Associated production batch ${existing.batchId} not found`);
      }

      const sampleSize = data.sampleSize ?? existing.sampleSize;
      const passedUnits = data.passedUnits ?? existing.passedUnits;
      const failedUnits = data.failedUnits ?? existing.failedUnits;
      const status = data.status ?? existing.status;

      if (sampleSize > batch.produced_quantity) {
        throw new BadRequestError(
          `Corrected sample size (${sampleSize}) cannot exceed the batch recorded produced quantity (${batch.produced_quantity}).`,
        );
      }

      if (passedUnits + failedUnits > sampleSize) {
        throw new BadRequestError(
          `Sum of passed (${passedUnits}) and failed (${failedUnits}) units cannot exceed sample size (${sampleSize}).`,
        );
      }

      if (status === 'COMPLETED' && passedUnits + failedUnits !== sampleSize) {
        throw new BadRequestError(
          `Completed inspections must be fully classified: passed (${passedUnits}) + failed (${failedUnits}) must equal sample size (${sampleSize}).`,
        );
      }

      let derivedResult = data.result ?? existing.result;
      if (
        data.result === undefined &&
        (data.failedUnits !== undefined || data.passedUnits !== undefined)
      ) {
        derivedResult = failedUnits === 0 ? 'PASS' : 'FAIL';
      }

      if (derivedResult === 'PASS' && failedUnits > 0) {
        throw new BadRequestError(
          `Inspection result cannot be PASS when ${failedUnits} failed units are recorded.`,
        );
      }

      const updated = await inspectionsRepository.update(
        id,
        {
          sampleSize: data.sampleSize,
          passedUnits: data.passedUnits,
          failedUnits: data.failedUnits,
          status: data.status,
          result: derivedResult,
          notes: data.notes,
          inspectedAt: data.inspectedAt,
        },
        client,
      );

      // Atomic audit logging with before & after state
      await auditService.record({
        client,
        actorId: context.actorId,
        action: 'CORRECTION',
        entityType: 'QUALITY_INSPECTION',
        entityId: id,
        beforeState: existing as unknown as Record<string, unknown>,
        afterState: {
          ...updated,
          reasonForCorrection:
            data.reasonForCorrection ?? 'Authorized supervisor/manager correction',
        } as unknown as Record<string, unknown>,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      });

      await client.query('COMMIT;');
      return updated;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const inspectionsService = new InspectionsService();
