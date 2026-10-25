import { pool } from '../../../infrastructure/database/pool.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../middleware/error.middleware.js';
import { auditService } from '../../audit/audit.service.js';
import { defectTypesRepository } from '../../master-data/defect-types/defect-types.repository.js';
import { inspectionsRepository } from '../inspections/inspections.repository.js';
import { defectsRepository } from './defects.repository.js';
import type {
  CreateDefectRecordRequest,
  DefectAnalyticsFilter,
  DefectAnalyticsResponse,
  DefectRecord,
  DefectRecordListQuery,
  DefectRecordListResponse,
  UpdateDefectRecordRequest,
} from '@qualityops/contracts';

export interface DefectContext {
  actorId?: string | undefined;
  requestId?: string | undefined;
  ipAddress?: string | undefined;
}

export class DefectsService {
  public async list(query: DefectRecordListQuery): Promise<DefectRecordListResponse> {
    return defectsRepository.list(query);
  }

  public async getById(id: string): Promise<DefectRecord> {
    const record = await defectsRepository.findById(id);
    if (!record) {
      throw new NotFoundError(`Defect finding with ID ${id} not found`);
    }
    return record;
  }

  public async getAnalytics(filter: DefectAnalyticsFilter): Promise<DefectAnalyticsResponse> {
    return defectsRepository.getAnalytics(filter);
  }

  public async create(
    data: CreateDefectRecordRequest,
    context: DefectContext,
  ): Promise<DefectRecord> {
    if (!context.actorId) {
      throw new BadRequestError('Inspector identity is required from authenticated session');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Verify associated quality inspection exists
      const inspection = await inspectionsRepository.findById(data.inspectionId, client);
      if (!inspection) {
        throw new NotFoundError(`Quality inspection with ID ${data.inspectionId} not found`);
      }

      // 2. Reject if inspection is cancelled
      if (inspection.status === 'CANCELLED') {
        throw new BadRequestError('Defect findings cannot be recorded on cancelled inspections');
      }

      // 3. Reject if completed inspection has 0 failed units (PASS result)
      if (inspection.status === 'COMPLETED' && inspection.failedUnits === 0) {
        throw new BadRequestError(
          'Defect findings cannot be recorded on completed inspections with zero failed units',
        );
      }

      // 4. Verify count invariants vs inspection sample bounds
      if (data.affectedUnitCount > data.occurrenceCount) {
        throw new BadRequestError(
          `Affected unit count (${data.affectedUnitCount}) cannot exceed occurrence count (${data.occurrenceCount}).`,
        );
      }

      if (data.affectedUnitCount > inspection.sampleSize) {
        throw new BadRequestError(
          `Affected unit count (${data.affectedUnitCount}) cannot exceed the inspection sample size (${inspection.sampleSize}).`,
        );
      }

      if (inspection.status === 'COMPLETED' && data.affectedUnitCount > inspection.failedUnits) {
        throw new BadRequestError(
          `Affected unit count (${data.affectedUnitCount}) cannot exceed the inspection classified failed units (${inspection.failedUnits}).`,
        );
      }

      // 5. Verify defect type exists and is active
      const defectType = await defectTypesRepository.findById(data.defectTypeId, client);
      if (!defectType) {
        throw new NotFoundError(`Defect type with ID ${data.defectTypeId} not found`);
      }
      if (!defectType.is_active) {
        throw new BadRequestError(
          `Defect type '${defectType.code}' is inactive and cannot be selected`,
        );
      }

      // 6. Check uniqueness of (inspection_id, defect_type_id)
      const existingFinding = await defectsRepository.findByInspectionAndDefectType(
        data.inspectionId,
        data.defectTypeId,
        client,
      );
      if (existingFinding) {
        throw new ConflictError(
          `A defect finding for inspection ${data.inspectionId} and defect type '${defectType.code}' already exists. Use the correction endpoint to update existing counts.`,
        );
      }

      // 7. Persist defect finding
      const created = await defectsRepository.create(
        {
          inspectionId: data.inspectionId,
          defectTypeId: data.defectTypeId,
          occurrenceCount: data.occurrenceCount,
          affectedUnitCount: data.affectedUnitCount,
          notes: data.notes ?? null,
        },
        client,
      );

      // 8. Atomic transactional audit logging
      await auditService.record({
        client,
        actorId: context.actorId,
        action: 'CREATE',
        entityType: 'DEFECT_RECORD',
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
    data: UpdateDefectRecordRequest,
    context: DefectContext,
  ): Promise<DefectRecord> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      const existing = await defectsRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`Defect finding with ID ${id} not found`);
      }

      const inspection = await inspectionsRepository.findById(existing.inspectionId, client);
      if (!inspection) {
        throw new NotFoundError(`Associated inspection ${existing.inspectionId} not found`);
      }

      const occurrenceCount = data.occurrenceCount ?? existing.occurrenceCount;
      const affectedUnitCount = data.affectedUnitCount ?? existing.affectedUnitCount;

      if (affectedUnitCount > occurrenceCount) {
        throw new BadRequestError(
          `Affected unit count (${affectedUnitCount}) cannot exceed occurrence count (${occurrenceCount}).`,
        );
      }

      if (affectedUnitCount > inspection.sampleSize) {
        throw new BadRequestError(
          `Affected unit count (${affectedUnitCount}) cannot exceed inspection sample size (${inspection.sampleSize}).`,
        );
      }

      if (inspection.status === 'COMPLETED' && affectedUnitCount > inspection.failedUnits) {
        throw new BadRequestError(
          `Affected unit count (${affectedUnitCount}) cannot exceed inspection failed units (${inspection.failedUnits}).`,
        );
      }

      const updated = await defectsRepository.update(
        id,
        {
          occurrenceCount: data.occurrenceCount,
          affectedUnitCount: data.affectedUnitCount,
          notes: data.notes,
        },
        client,
      );

      // Atomic transactional audit logging with before and after state
      await auditService.record({
        client,
        actorId: context.actorId,
        action: 'CORRECTION',
        entityType: 'DEFECT_RECORD',
        entityId: id,
        beforeState: existing as unknown as Record<string, unknown>,
        afterState: {
          ...updated,
          reasonForCorrection: data.reasonForCorrection,
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

export const defectsService = new DefectsService();
