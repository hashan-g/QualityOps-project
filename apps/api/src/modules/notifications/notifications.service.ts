import fs from 'node:fs';
import type { PoolClient } from 'pg';
import { pool } from '../../infrastructure/database/pool.js';
import { config } from '../../config.js';
import {
  notificationsRepository,
  type NotificationsRepository,
} from './notifications.repository.js';
import { getEmailTransport } from './transports/email-transport.factory.js';
import {
  artifactStorage,
  type ArtifactStorageService,
} from '../reports/exports/artifact.storage.js';
import type {
  NotificationResponse,
  NotificationListFilter,
  OperationalAlert,
  ReportRunResponse,
  ScheduledReportResponse,
  ExportFormat,
} from '@qualityops/contracts';
import { NotFoundError, BadRequestError } from '../../middleware/error.middleware.js';

export interface ProcessDeliveriesResult {
  processed: number;
  sent: number;
  failed: number;
  errors: string[];
}

export class NotificationsService {
  constructor(
    private readonly repo: NotificationsRepository = notificationsRepository,
    private readonly storage: ArtifactStorageService = artifactStorage,
  ) {}

  // --------------------------------------------------------------------------
  // In-App Notifications
  // --------------------------------------------------------------------------

  public async listNotifications(
    userId: string,
    filter: NotificationListFilter,
  ): Promise<{ notifications: NotificationResponse[]; total: number; unreadCount: number }> {
    return this.repo.listNotificationsForUser(userId, filter);
  }

  public async getNotificationById(id: string, userId: string): Promise<NotificationResponse> {
    const notification = await this.repo.getNotificationById(id, userId);
    if (!notification) {
      throw new NotFoundError(`Notification "${id}" not found`);
    }
    return notification;
  }

  public async markNotificationRead(id: string, userId: string): Promise<NotificationResponse> {
    const updated = await this.repo.markAsRead(id, userId);
    if (!updated) {
      // Check if it exists at all
      const existing = await this.repo.getNotificationById(id, userId);
      if (!existing) {
        throw new NotFoundError(`Notification "${id}" not found`);
      }
      // If already read, return it idempotent
      return existing;
    }
    return updated;
  }

  public async markAllNotificationsRead(userId: string): Promise<{ count: number }> {
    const count = await this.repo.markAllAsRead(userId);
    return { count };
  }

  // --------------------------------------------------------------------------
  // Operational Alert Dispatch Integration
  // --------------------------------------------------------------------------

  /**
   * Dispatches notifications for an operational alert to eligible active users.
   * Only CRITICAL and HIGH severity alerts trigger notifications.
   */
  public async dispatchAlertNotifications(
    alert: OperationalAlert,
    client?: PoolClient,
  ): Promise<{ inAppCreated: number; emailDeliveriesQueued: number }> {
    if (alert.severity !== 'CRITICAL' && alert.severity !== 'HIGH') {
      return { inAppCreated: 0, emailDeliveriesQueued: 0 };
    }

    const eligibleUsers = await this.repo.getEligibleUsersForAlert(client);
    let inAppCreated = 0;
    let emailDeliveriesQueued = 0;

    for (const user of eligibleUsers) {
      // 1. Create In-App Notification (Idempotent per alert + user)
      const inAppIdempotencyKey = `alert-inapp:${alert.id}:${user.id}`;
      const notification = await this.repo.createNotification(
        {
          userId: user.id,
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
          channel: 'IN_APP',
          entityType: 'OPERATIONAL_ALERT',
          entityId: alert.id,
          metadata: {
            ruleType: alert.ruleType,
            fingerprint: alert.fingerprint,
            entityType: alert.entityType,
            entityId: alert.entityId,
          },
          idempotencyKey: inAppIdempotencyKey,
        },
        client,
      );

      if (notification) {
        inAppCreated++;
      }

      // 2. Queue Email Delivery (Idempotent per alert + user)
      const emailIdempotencyKey = `alert-email:${alert.id}:${user.id}`;
      const subject = `[QualityOps Alert - ${alert.severity}] ${alert.title}`;
      const bodyText = [
        `QualityOps Operational Alert Detected`,
        `======================================`,
        `Severity:   ${alert.severity}`,
        `Rule:       ${alert.ruleType}`,
        `Title:      ${alert.title}`,
        `Details:    ${alert.message}`,
        ``,
        `Entity:     ${alert.entityType} (${alert.entityId})`,
        `Detected:   ${alert.createdAt}`,
        ``,
        `Please log in to QualityOps to triage and resolve this operational alert.`,
      ].join('\n');

      const delivery = await this.repo.createEmailDelivery(
        {
          notificationId: notification?.id ?? null,
          recipientEmail: user.email,
          recipientUserId: user.id,
          subject,
          bodyText,
          idempotencyKey: emailIdempotencyKey,
          maxAttempts: config.EMAIL_MAX_RETRY_ATTEMPTS,
        },
        client,
      );

      if (delivery) {
        emailDeliveriesQueued++;
      }
    }

    return { inAppCreated, emailDeliveriesQueued };
  }

  // --------------------------------------------------------------------------
  // Scheduled Report Dispatch Integration
  // --------------------------------------------------------------------------

  /**
   * Dispatches email deliveries for a completed scheduled report run.
   */
  public async dispatchScheduledReportDelivery(
    reportRun: ReportRunResponse,
    schedule: ScheduledReportResponse,
    client?: PoolClient,
  ): Promise<{ queuedCount: number }> {
    const recipients = schedule.recipients;
    if (!recipients || recipients.length === 0) {
      return { queuedCount: 0 };
    }

    let queuedCount = 0;
    const subject = `[QualityOps Report] ${schedule.name} (${schedule.format})`;
    const bodyText = [
      `QualityOps Scheduled Report Delivery`,
      `=====================================`,
      `Report:     ${schedule.name}`,
      `Type:       ${schedule.reportType}`,
      `Format:     ${schedule.format}`,
      `Cadence:    ${schedule.cadence}`,
      `Generated:  ${reportRun.completedAt ?? new Date().toISOString()}`,
      ``,
      `Please find attached the generated ${schedule.format} report artifact.`,
      `This report is automatically dispatched per the configured schedule.`,
    ].join('\n');

    for (const recipient of recipients) {
      const idempotencyKey = `report-run-email:${reportRun.id}:${recipient.toLowerCase().trim()}`;

      const delivery = await this.repo.createEmailDelivery(
        {
          recipientEmail: recipient.toLowerCase().trim(),
          recipientUserId: schedule.createdBy ?? null,
          subject,
          bodyText,
          artifactId: reportRun.artifactId,
          reportRunId: reportRun.id,
          idempotencyKey,
          maxAttempts: config.EMAIL_MAX_RETRY_ATTEMPTS,
        },
        client,
      );

      if (delivery) {
        queuedCount++;
      }
    }

    return { queuedCount };
  }

  // --------------------------------------------------------------------------
  // Asynchronous Delivery Processing (Background Worker)
  // --------------------------------------------------------------------------

  /**
   * Processes due and retriable pending email deliveries with row-level locking.
   * Defends against duplicate sends, concurrent worker clashes, and unhandled errors.
   */
  public async processPendingEmailDeliveries(limit = 10): Promise<ProcessDeliveriesResult> {
    const errors: string[] = [];
    let sent = 0;
    let failed = 0;

    // 1. If email is disabled in config, skip delivery gracefully without failing
    if (!config.EMAIL_ENABLED) {
      return { processed: 0, sent: 0, failed: 0, errors: [] };
    }

    const transport = getEmailTransport();
    const client: PoolClient = await pool.connect();
    let claimedDeliveries = [];

    try {
      await client.query('BEGIN;');
      claimedDeliveries = await this.repo.claimDueDeliveries(limit, client);

      for (const d of claimedDeliveries) {
        await this.repo.markDeliverySending(d.id, client);
      }
      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to claim email deliveries: ${errMsg}`);
      return { processed: 0, sent: 0, failed: 0, errors };
    } finally {
      client.release();
    }

    // 2. Process claimed deliveries outside database transaction
    for (const delivery of claimedDeliveries) {
      try {
        let attachments: { filename: string; content: Buffer; contentType?: string }[] | undefined;

        // If an artifact is associated with this email, attach it safely
        if (delivery.artifactId) {
          attachments = await this.resolveDeliveryAttachment(
            delivery.artifactId,
            delivery.reportRunId,
          );
        }

        await transport.sendMail({
          to: delivery.recipientEmail,
          subject: delivery.subject,
          text: delivery.bodyText,
          html: delivery.bodyHtml ?? undefined,
          attachments,
        });

        await this.repo.markDeliverySent(delivery.id);
        sent++;
      } catch (err) {
        failed++;
        const rawErrMsg = err instanceof Error ? err.message : String(err);
        // Sanitize any passwords or tokens in error message
        const sanitizedErr = config.SMTP_PASS
          ? rawErrMsg.split(config.SMTP_PASS).join('[REDACTED]')
          : rawErrMsg;

        errors.push(
          `Delivery ${delivery.id} to ${delivery.recipientEmail} failed: ${sanitizedErr}`,
        );

        await this.repo.markDeliveryFailed(
          delivery.id,
          delivery.attemptCount,
          delivery.maxAttempts,
          sanitizedErr,
        );
      }
    }

    return {
      processed: claimedDeliveries.length,
      sent,
      failed,
      errors,
    };
  }

  /**
   * Resolves and bounds an attachment from report artifact storage.
   */
  private async resolveDeliveryAttachment(
    artifactId: string,
    reportRunId?: string | null,
  ): Promise<{ filename: string; content: Buffer; contentType: string }[]> {
    // Determine export format from report_runs if possible
    let format: ExportFormat = 'PDF';
    if (reportRunId) {
      const runRes = await pool.query<{ format: ExportFormat }>(
        'SELECT format FROM report_runs WHERE id = $1',
        [reportRunId],
      );
      if (runRes.rows[0]) {
        format = runRes.rows[0].format;
      }
    }

    // Find the file format by checking possible extensions if run record was not found
    if (!this.storage.artifactExists(artifactId, format)) {
      const candidates: ExportFormat[] = ['PDF', 'XLSX', 'CSV'];
      for (const c of candidates) {
        if (this.storage.artifactExists(artifactId, c)) {
          format = c;
          break;
        }
      }
    }

    const filePath = this.storage.resolveSafePath(artifactId, format);

    if (!fs.existsSync(filePath)) {
      throw new BadRequestError(`Artifact file "${artifactId}" not found in storage directory`);
    }

    const stat = await fs.promises.stat(filePath);
    if (stat.size > config.EMAIL_MAX_ATTACHMENT_SIZE_BYTES) {
      throw new BadRequestError(
        `Artifact file size (${stat.size} bytes) exceeds maximum email attachment limit (${config.EMAIL_MAX_ATTACHMENT_SIZE_BYTES} bytes)`,
      );
    }

    const content = await fs.promises.readFile(filePath);
    const contentTypeMap: Record<ExportFormat, string> = {
      PDF: 'application/pdf',
      XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      CSV: 'text/csv; charset=utf-8',
    };

    return [
      {
        filename: `QualityOps-Report-${artifactId}.${format.toLowerCase()}`,
        content,
        contentType: contentTypeMap[format],
      },
    ];
  }
}

export const notificationsService = new NotificationsService();
