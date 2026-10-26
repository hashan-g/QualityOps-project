import { alertsRepository, type AlertsRepository } from './alerts.repository.js';
import { alertsEvaluator, type AlertsEvaluator } from './alerts.evaluator.js';
import { auditService, type AuditService } from '../audit/audit.service.js';
import type {
  OperationalAlert,
  AlertListFilter,
  AlertEvaluationResult,
} from '@qualityops/contracts';
import { NotFoundError, BadRequestError } from '../../middleware/error.middleware.js';

export class AlertsService {
  constructor(
    private readonly repo: AlertsRepository = alertsRepository,
    private readonly evaluator: AlertsEvaluator = alertsEvaluator,
    private readonly audit: AuditService = auditService,
  ) {}

  public async listAlerts(
    filter: AlertListFilter,
  ): Promise<{ alerts: OperationalAlert[]; total: number }> {
    return this.repo.listAlerts(filter);
  }

  public async getAlertById(id: string): Promise<OperationalAlert> {
    const alert = await this.repo.getAlertById(id);
    if (!alert) {
      throw new NotFoundError(`Operational alert "${id}" not found`);
    }
    return alert;
  }

  public async acknowledgeAlert(id: string, userId: string): Promise<OperationalAlert> {
    const existing = await this.getAlertById(id);
    if (existing.status !== 'OPEN') {
      throw new BadRequestError(
        `Cannot acknowledge alert in "${existing.status}" status; must be "OPEN"`,
      );
    }

    const updated = await this.repo.acknowledgeAlert(id, userId);
    if (!updated) {
      throw new NotFoundError(`Alert "${id}" not found or state changed concurrently`);
    }

    await this.audit.record({
      actorId: userId,
      action: 'ACKNOWLEDGE',
      entityType: 'OPERATIONAL_ALERT',
      entityId: id,
      beforeState: existing as unknown as Record<string, unknown>,
      afterState: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }

  public async resolveAlert(id: string, userId: string, notes: string): Promise<OperationalAlert> {
    const trimmedNotes = notes.trim();
    if (!trimmedNotes) {
      throw new BadRequestError(
        'Resolution notes are mandatory when resolving an operational alert',
      );
    }

    const existing = await this.getAlertById(id);
    if (existing.status === 'RESOLVED') {
      throw new BadRequestError('Alert is already resolved');
    }

    const updated = await this.repo.resolveAlert(id, userId, trimmedNotes);
    if (!updated) {
      throw new NotFoundError(`Alert "${id}" not found or state changed concurrently`);
    }

    await this.audit.record({
      actorId: userId,
      action: 'RESOLVE',
      entityType: 'OPERATIONAL_ALERT',
      entityId: id,
      beforeState: existing as unknown as Record<string, unknown>,
      afterState: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }

  public async evaluateAlerts(): Promise<AlertEvaluationResult> {
    return this.evaluator.evaluateAll();
  }
}

export const alertsService = new AlertsService();
