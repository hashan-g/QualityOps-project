import { pool } from '../../../infrastructure/database/pool.js';
import { capaRepository } from './capa.repository.js';
import { auditService } from '../../audit/audit.service.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../middleware/error.middleware.js';
import type { AuthenticatedUser } from '../../../middleware/auth.middleware.js';
import type {
  CapaAction,
  CapaCase,
  CapaCaseDetailResponse,
  CapaCaseListQuery,
  CapaCaseListResponse,
  CompleteCapaActionRequest,
  CreateCapaActionRequest,
  CreateCapaCaseRequest,
  UpdateCapaActionRequest,
  UpdateCapaCaseRequest,
  VerifyCapaCaseRequest,
} from '@qualityops/contracts';

export class CapaService {
  /**
   * Lists CAPA cases with server-side pagination, search, and multi-criteria filters.
   */
  public async listCases(query: CapaCaseListQuery): Promise<CapaCaseListResponse> {
    return capaRepository.listCases(query);
  }

  /**
   * Retrieves case detail along with its defined actions.
   */
  public async getCaseDetail(id: string): Promise<CapaCaseDetailResponse> {
    const capaCase = await capaRepository.findCaseById(id);
    if (!capaCase) {
      throw new NotFoundError(`CAPA case "${id}" not found`);
    }

    const actions = await capaRepository.listActionsByCaseId(id);
    return {
      case: capaCase,
      actions,
    };
  }

  /**
   * Creates a new CAPA case linked to source defect or batch inside an atomic transaction.
   */
  public async createCase(
    params: CreateCapaCaseRequest,
    user: AuthenticatedUser,
    meta?: { requestId?: string | undefined; ipAddress?: string | undefined },
  ): Promise<CapaCase> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Validate Defect Record link if provided
      let resolvedBatchId = params.batchId;
      if (params.defectRecordId) {
        const defectRes = await client.query<{ id: string; batch_id: string | null }>(
          `SELECT dr.id, qi.batch_id
           FROM defect_records dr
           JOIN quality_inspections qi ON dr.inspection_id = qi.id
           WHERE dr.id = $1;`,
          [params.defectRecordId],
        );

        if (defectRes.rows.length === 0) {
          throw new BadRequestError(
            `Referenced defect record "${params.defectRecordId}" does not exist`,
          );
        }

        if (!resolvedBatchId && defectRes.rows[0]?.batch_id) {
          resolvedBatchId = defectRes.rows[0].batch_id;
        }
      }

      // 2. Validate Batch link if provided
      if (resolvedBatchId) {
        const batchRes = await client.query<{ id: string }>(
          `SELECT id FROM production_batches WHERE id = $1;`,
          [resolvedBatchId],
        );
        if (batchRes.rows.length === 0) {
          throw new BadRequestError(
            `Referenced production batch "${resolvedBatchId}" does not exist`,
          );
        }
      }

      // 3. Validate Assignee if provided
      if (params.assignedTo) {
        const assigneeRes = await client.query<{ id: string; is_active: boolean }>(
          `SELECT id, is_active FROM users WHERE id = $1;`,
          [params.assignedTo],
        );
        if (assigneeRes.rows.length === 0 || !assigneeRes.rows[0]?.is_active) {
          throw new BadRequestError(
            `Assigned user "${params.assignedTo}" does not exist or is inactive`,
          );
        }
      }

      // 4. Generate Case Number
      const caseNumber = await capaRepository.generateCaseNumber(client);

      // 5. Insert Case
      const caseId = await capaRepository.createCase(
        {
          caseNumber,
          title: params.title.trim(),
          description: params.description.trim(),
          source: params.source,
          priority: params.priority ?? 'MEDIUM',
          batchId: resolvedBatchId,
          defectRecordId: params.defectRecordId,
          assignedTo: params.assignedTo,
          createdBy: user.id,
          dueDate: params.dueDate,
          rootCause: params.rootCause?.trim(),
        },
        client,
      );

      // 6. Record Audit Log
      await auditService.record({
        actorId: user.id,
        action: 'CREATE',
        entityType: 'CAPA_CASE',
        entityId: caseId,
        requestId: meta?.requestId,
        ipAddress: meta?.ipAddress,
        beforeState: null,
        afterState: {
          caseNumber,
          title: params.title,
          source: params.source,
          priority: params.priority ?? 'MEDIUM',
          batchId: resolvedBatchId,
          defectRecordId: params.defectRecordId,
          assignedTo: params.assignedTo,
        },
        client,
      });

      await client.query('COMMIT;');

      const created = await capaRepository.findCaseById(caseId);
      if (!created) {
        throw new Error('Failed to retrieve newly created CAPA case');
      }
      return created;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Updates case details or performs permitted status transitions.
   */
  public async updateCase(
    id: string,
    params: UpdateCapaCaseRequest,
    user: AuthenticatedUser,
    meta?: { requestId?: string | undefined; ipAddress?: string | undefined },
  ): Promise<CapaCase> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      const existingRes = await client.query<{
        id: string;
        status: string;
        title: string;
        description: string;
        priority: string;
        assigned_to: string | null;
        due_date: string | null;
        root_cause: string | null;
      }>('SELECT * FROM capa_cases WHERE id = $1 FOR UPDATE;', [id]);

      if (existingRes.rows.length === 0) {
        throw new NotFoundError(`CAPA case "${id}" not found`);
      }

      const existing = existingRes.rows[0]!;

      if (existing.status === 'CLOSED' || existing.status === 'CANCELLED') {
        throw new BadRequestError(`Cannot modify a ${existing.status.toLowerCase()} CAPA case`);
      }

      // Rejection: Case closure cannot be triggered via direct PATCH
      if (params.status === 'CLOSED') {
        throw new BadRequestError(
          'CAPA cases cannot be closed via general update; use the explicit case closure endpoint',
        );
      }

      // Status transition validation
      if (params.status && params.status !== existing.status) {
        const allowedTransitions: Record<string, string[]> = {
          OPEN: ['IN_PROGRESS', 'CANCELLED'],
          IN_PROGRESS: ['UNDER_REVIEW', 'CANCELLED'],
          UNDER_REVIEW: ['IN_PROGRESS', 'CANCELLED'],
        };

        const validNext = allowedTransitions[existing.status] ?? [];
        if (!validNext.includes(params.status)) {
          throw new BadRequestError(
            `Invalid status transition from "${existing.status}" to "${params.status}". Allowed: [${validNext.join(', ')}]`,
          );
        }

        if (
          params.status === 'CANCELLED' &&
          (!params.changeReason || params.changeReason.length < 5)
        ) {
          throw new BadRequestError(
            'A change reason of at least 5 characters is required to cancel a CAPA case',
          );
        }
      }

      // Assignee check
      if (params.assignedTo) {
        const assigneeRes = await client.query<{ id: string; is_active: boolean }>(
          `SELECT id, is_active FROM users WHERE id = $1;`,
          [params.assignedTo],
        );
        if (assigneeRes.rows.length === 0 || !assigneeRes.rows[0]?.is_active) {
          throw new BadRequestError(
            `Assigned user "${params.assignedTo}" does not exist or is inactive`,
          );
        }
      }

      await capaRepository.updateCase(
        id,
        {
          title: params.title?.trim(),
          description: params.description?.trim(),
          source: params.source,
          priority: params.priority,
          assignedTo: params.assignedTo,
          dueDate: params.dueDate,
          rootCause: params.rootCause?.trim(),
          status: params.status,
        },
        client,
      );

      await auditService.record({
        actorId: user.id,
        action: params.status ? 'STATUS_CHANGE' : 'UPDATE',
        entityType: 'CAPA_CASE',
        entityId: id,
        requestId: meta?.requestId,
        ipAddress: meta?.ipAddress,
        beforeState: {
          title: existing.title,
          status: existing.status,
          priority: existing.priority,
          assignedTo: existing.assigned_to,
        },
        afterState: {
          title: params.title ?? existing.title,
          status: params.status ?? existing.status,
          priority: params.priority ?? existing.priority,
          assignedTo: params.assignedTo !== undefined ? params.assignedTo : existing.assigned_to,
          changeReason: params.changeReason,
        },
        client,
      });

      await client.query('COMMIT;');

      const updated = await capaRepository.findCaseById(id);
      if (!updated) {
        throw new Error('Failed to retrieve updated CAPA case');
      }
      return updated;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Records independent verification outcome for a CAPA case.
   */
  public async verifyCase(
    id: string,
    params: VerifyCapaCaseRequest,
    user: AuthenticatedUser,
    meta?: { requestId?: string | undefined; ipAddress?: string | undefined },
  ): Promise<CapaCaseDetailResponse> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      const caseRes = await client.query<{
        id: string;
        case_number: string;
        status: string;
        assigned_to: string | null;
        created_by: string;
      }>(
        'SELECT id, case_number, status, assigned_to, created_by FROM capa_cases WHERE id = $1 FOR UPDATE;',
        [id],
      );

      if (caseRes.rows.length === 0) {
        throw new NotFoundError(`CAPA case "${id}" not found`);
      }

      const existing = caseRes.rows[0]!;

      if (existing.status === 'CLOSED' || existing.status === 'CANCELLED') {
        throw new BadRequestError(`Cannot verify a ${existing.status.toLowerCase()} CAPA case`);
      }

      // Independent verification rule: action owner cannot self-verify their assigned case unless Admin override
      const isAdmin = user.roles.includes('ADMIN');
      if (existing.assigned_to === user.id && !isAdmin) {
        throw new ForbiddenError(
          'Action owner cannot verify their own assigned CAPA case. Independent verification by another Quality Manager or Admin is required.',
        );
      }

      // Actions completion verification
      const totalActions = await capaRepository.countTotalActions(id, client);
      if (totalActions === 0) {
        throw new BadRequestError('Cannot verify a CAPA case with no actions defined');
      }

      const pendingActions = await capaRepository.countPendingActions(id, client);
      if (pendingActions > 0) {
        throw new BadRequestError(
          `Cannot verify CAPA case while ${pendingActions} required action(s) remain incomplete`,
        );
      }

      if (params.result === 'PASS') {
        await capaRepository.updateCase(
          id,
          {
            verifiedBy: user.id,
            verifiedAt: new Date().toISOString(),
            verificationNotes: params.notes.trim(),
            status: 'UNDER_REVIEW',
          },
          client,
        );
      } else {
        // Verification failed: reset verification and return case to IN_PROGRESS
        await capaRepository.updateCase(
          id,
          {
            verifiedBy: null,
            verifiedAt: null,
            verificationNotes: `VERIFICATION FAILED: ${params.notes.trim()}`,
            status: 'IN_PROGRESS',
          },
          client,
        );
      }

      await auditService.record({
        actorId: user.id,
        action: 'VERIFY',
        entityType: 'CAPA_CASE',
        entityId: id,
        requestId: meta?.requestId,
        ipAddress: meta?.ipAddress,
        beforeState: { status: existing.status },
        afterState: {
          result: params.result,
          notes: params.notes,
          verifiedBy: params.result === 'PASS' ? user.id : null,
          status: params.result === 'PASS' ? 'UNDER_REVIEW' : 'IN_PROGRESS',
        },
        client,
      });

      await client.query('COMMIT;');

      return this.getCaseDetail(id);
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Formally closes a CAPA case when all closure preconditions are satisfied.
   */
  public async closeCase(
    id: string,
    user: AuthenticatedUser,
    closureNotes?: string,
    meta?: { requestId?: string | undefined; ipAddress?: string | undefined },
  ): Promise<CapaCase> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      const caseRes = await client.query<{
        id: string;
        case_number: string;
        status: string;
        verified_by: string | null;
        verified_at: Date | null;
        assigned_to: string | null;
      }>(
        'SELECT id, case_number, status, verified_by, verified_at, assigned_to FROM capa_cases WHERE id = $1 FOR UPDATE;',
        [id],
      );

      if (caseRes.rows.length === 0) {
        throw new NotFoundError(`CAPA case "${id}" not found`);
      }

      const existing = caseRes.rows[0]!;

      if (existing.status === 'CLOSED') {
        throw new ConflictError(`CAPA case "${existing.case_number}" is already closed`);
      }

      if (existing.status === 'CANCELLED') {
        throw new BadRequestError(`Cannot close a cancelled CAPA case`);
      }

      // Precondition 1: Must have actions
      const totalActions = await capaRepository.countTotalActions(id, client);
      if (totalActions === 0) {
        throw new BadRequestError(
          'Cannot close CAPA case: at least one corrective/preventive action is required',
        );
      }

      // Precondition 2: All actions must be complete
      const pendingActions = await capaRepository.countPendingActions(id, client);
      if (pendingActions > 0) {
        throw new BadRequestError(
          `Cannot close CAPA case: ${pendingActions} required action(s) remain incomplete`,
        );
      }

      // Precondition 3: Must have passed verification
      if (!existing.verified_by || !existing.verified_at) {
        throw new BadRequestError(
          'Cannot close CAPA case: successful verification by an authorized Quality Manager is required before closure',
        );
      }

      await capaRepository.updateCase(
        id,
        {
          status: 'CLOSED',
        },
        client,
      );

      await auditService.record({
        actorId: user.id,
        action: 'CLOSE',
        entityType: 'CAPA_CASE',
        entityId: id,
        requestId: meta?.requestId,
        ipAddress: meta?.ipAddress,
        beforeState: { status: existing.status },
        afterState: {
          status: 'CLOSED',
          closureNotes: closureNotes?.trim(),
          verifiedBy: existing.verified_by,
          verifiedAt: existing.verified_at,
        },
        client,
      });

      await client.query('COMMIT;');

      const closed = await capaRepository.findCaseById(id);
      if (!closed) {
        throw new Error('Failed to retrieve closed CAPA case');
      }
      return closed;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Adds a new corrective/preventive action to a CAPA case.
   */
  public async createAction(
    caseId: string,
    params: CreateCapaActionRequest,
    user: AuthenticatedUser,
    meta?: { requestId?: string | undefined; ipAddress?: string | undefined },
  ): Promise<CapaAction> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      const caseRes = await client.query<{ id: string; status: string }>(
        'SELECT id, status FROM capa_cases WHERE id = $1 FOR UPDATE;',
        [caseId],
      );

      if (caseRes.rows.length === 0) {
        throw new NotFoundError(`CAPA case "${caseId}" not found`);
      }

      const capaCase = caseRes.rows[0]!;
      if (capaCase.status === 'CLOSED' || capaCase.status === 'CANCELLED') {
        throw new BadRequestError(
          `Cannot add actions to a ${capaCase.status.toLowerCase()} CAPA case`,
        );
      }

      // Validate assignee if provided
      if (params.assignedTo) {
        const assigneeRes = await client.query<{ id: string; is_active: boolean }>(
          `SELECT id, is_active FROM users WHERE id = $1;`,
          [params.assignedTo],
        );
        if (assigneeRes.rows.length === 0 || !assigneeRes.rows[0]?.is_active) {
          throw new BadRequestError(
            `Assigned user "${params.assignedTo}" does not exist or is inactive`,
          );
        }
      }

      const actionId = await capaRepository.createAction(
        {
          capaCaseId: caseId,
          actionType: params.actionType,
          description: params.description.trim(),
          assignedTo: params.assignedTo,
          dueDate: params.dueDate,
        },
        client,
      );

      // If case was OPEN, transition automatically to IN_PROGRESS upon defining first action
      if (capaCase.status === 'OPEN') {
        await capaRepository.updateCase(caseId, { status: 'IN_PROGRESS' }, client);
      }

      await auditService.record({
        actorId: user.id,
        action: 'CREATE',
        entityType: 'CAPA_ACTION',
        entityId: actionId,
        requestId: meta?.requestId,
        ipAddress: meta?.ipAddress,
        beforeState: null,
        afterState: {
          capaCaseId: caseId,
          actionType: params.actionType,
          description: params.description,
          assignedTo: params.assignedTo,
          dueDate: params.dueDate,
        },
        client,
      });

      await client.query('COMMIT;');

      const action = await capaRepository.findActionById(caseId, actionId);
      if (!action) {
        throw new Error('Failed to retrieve newly created CAPA action');
      }
      return action;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Updates an existing CAPA action with ownership and boundary validation.
   */
  public async updateAction(
    caseId: string,
    actionId: string,
    params: UpdateCapaActionRequest,
    user: AuthenticatedUser,
    meta?: { requestId?: string | undefined; ipAddress?: string | undefined },
  ): Promise<CapaAction> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      // Verify case exists
      const caseRes = await client.query<{ id: string; status: string }>(
        'SELECT id, status FROM capa_cases WHERE id = $1 FOR UPDATE;',
        [caseId],
      );
      if (caseRes.rows.length === 0) {
        throw new NotFoundError(`CAPA case "${caseId}" not found`);
      }
      if (caseRes.rows[0]!.status === 'CLOSED' || caseRes.rows[0]!.status === 'CANCELLED') {
        throw new BadRequestError(
          `Cannot modify actions on a ${caseRes.rows[0]!.status.toLowerCase()} CAPA case`,
        );
      }

      // Verify action exists under this case (cross-case protection)
      const actionRes = await client.query<{
        id: string;
        capa_case_id: string;
        status: string;
        assigned_to: string | null;
        description: string;
      }>('SELECT * FROM capa_actions WHERE id = $1 AND capa_case_id = $2 FOR UPDATE;', [
        actionId,
        caseId,
      ]);

      if (actionRes.rows.length === 0) {
        throw new NotFoundError(`CAPA action "${actionId}" not found under case "${caseId}"`);
      }

      const existingAction = actionRes.rows[0]!;

      // Ownership enforcement: Admin, Quality Manager, or assigned user
      const isPrivileged = user.roles.includes('ADMIN') || user.roles.includes('QUALITY_MANAGER');
      const isOwner = existingAction.assigned_to === user.id;

      if (!isPrivileged && !isOwner) {
        throw new ForbiddenError(
          'Only the assigned action owner, Quality Manager, or Admin may update this action',
        );
      }

      // Validate assignee if changed
      if (params.assignedTo) {
        const assigneeRes = await client.query<{ id: string; is_active: boolean }>(
          `SELECT id, is_active FROM users WHERE id = $1;`,
          [params.assignedTo],
        );
        if (assigneeRes.rows.length === 0 || !assigneeRes.rows[0]?.is_active) {
          throw new BadRequestError(
            `Assigned user "${params.assignedTo}" does not exist or is inactive`,
          );
        }
      }

      await capaRepository.updateAction(
        caseId,
        actionId,
        {
          description: params.description?.trim(),
          assignedTo: params.assignedTo,
          dueDate: params.dueDate,
          status: params.status,
        },
        client,
      );

      await auditService.record({
        actorId: user.id,
        action: params.status ? 'STATUS_CHANGE' : 'UPDATE',
        entityType: 'CAPA_ACTION',
        entityId: actionId,
        requestId: meta?.requestId,
        ipAddress: meta?.ipAddress,
        beforeState: { status: existingAction.status, description: existingAction.description },
        afterState: {
          description: params.description ?? existingAction.description,
          assignedTo:
            params.assignedTo !== undefined ? params.assignedTo : existingAction.assigned_to,
          status: params.status ?? existingAction.status,
        },
        client,
      });

      await client.query('COMMIT;');

      const updated = await capaRepository.findActionById(caseId, actionId);
      if (!updated) {
        throw new Error('Failed to retrieve updated CAPA action');
      }
      return updated;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Marks a CAPA action as completed with completion notes/evidence.
   */
  public async completeAction(
    caseId: string,
    actionId: string,
    params: CompleteCapaActionRequest,
    user: AuthenticatedUser,
    meta?: { requestId?: string | undefined; ipAddress?: string | undefined },
  ): Promise<CapaAction> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      // Verify case
      const caseRes = await client.query<{ id: string; status: string }>(
        'SELECT id, status FROM capa_cases WHERE id = $1 FOR UPDATE;',
        [caseId],
      );
      if (caseRes.rows.length === 0) {
        throw new NotFoundError(`CAPA case "${caseId}" not found`);
      }
      if (caseRes.rows[0]!.status === 'CLOSED' || caseRes.rows[0]!.status === 'CANCELLED') {
        throw new BadRequestError(
          `Cannot complete action on a ${caseRes.rows[0]!.status.toLowerCase()} CAPA case`,
        );
      }

      // Verify action and cross-case isolation
      const actionRes = await client.query<{
        id: string;
        capa_case_id: string;
        status: string;
        assigned_to: string | null;
      }>('SELECT * FROM capa_actions WHERE id = $1 AND capa_case_id = $2 FOR UPDATE;', [
        actionId,
        caseId,
      ]);

      if (actionRes.rows.length === 0) {
        throw new NotFoundError(`CAPA action "${actionId}" not found under case "${caseId}"`);
      }

      const existingAction = actionRes.rows[0]!;

      if (existingAction.status === 'COMPLETED' || existingAction.status === 'VERIFIED') {
        throw new ConflictError(`Action "${actionId}" is already completed`);
      }

      // Ownership enforcement
      const isPrivileged = user.roles.includes('ADMIN') || user.roles.includes('QUALITY_MANAGER');
      const isOwner = existingAction.assigned_to === user.id;

      if (!isPrivileged && !isOwner) {
        throw new ForbiddenError(
          'Only the assigned action owner, Quality Manager, or Admin may mark this action complete',
        );
      }

      await capaRepository.updateAction(
        caseId,
        actionId,
        {
          status: 'COMPLETED',
          completedAt: new Date().toISOString(),
          completionNotes: params.completionNotes.trim(),
        },
        client,
      );

      await auditService.record({
        actorId: user.id,
        action: 'STATUS_CHANGE',
        entityType: 'CAPA_ACTION',
        entityId: actionId,
        requestId: meta?.requestId,
        ipAddress: meta?.ipAddress,
        beforeState: { status: existingAction.status },
        afterState: {
          status: 'COMPLETED',
          completionNotes: params.completionNotes,
          completedAt: new Date().toISOString(),
        },
        client,
      });

      // If all actions for this case are now complete and case was IN_PROGRESS, move to UNDER_REVIEW
      const pendingCount = await capaRepository.countPendingActions(caseId, client);
      if (pendingCount === 0 && caseRes.rows[0]!.status === 'IN_PROGRESS') {
        await capaRepository.updateCase(caseId, { status: 'UNDER_REVIEW' }, client);
      }

      await client.query('COMMIT;');

      const completed = await capaRepository.findActionById(caseId, actionId);
      if (!completed) {
        throw new Error('Failed to retrieve completed CAPA action');
      }
      return completed;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const capaService = new CapaService();
