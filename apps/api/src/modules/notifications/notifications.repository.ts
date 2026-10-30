import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../../infrastructure/database/pool.js';
import type {
  NotificationResponse,
  NotificationListFilter,
  NotificationSeverity,
  NotificationChannel,
  NotificationEntityType,
  EmailDeliveryResponse,
  EmailDeliveryStatus,
} from '@qualityops/contracts';

export interface CreateNotificationInput {
  userId: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  channel?: NotificationChannel | undefined;
  entityType?: NotificationEntityType | null | undefined;
  entityId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
  idempotencyKey?: string | undefined;
}

export interface CreateEmailDeliveryInput {
  notificationId?: string | null | undefined;
  recipientEmail: string;
  recipientUserId?: string | null | undefined;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null | undefined;
  artifactId?: string | null | undefined;
  reportRunId?: string | null | undefined;
  idempotencyKey?: string | undefined;
  maxAttempts?: number | undefined;
}

export interface EligibleUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
}

interface UserRow extends QueryResultRow {
  id: string;
  username: string;
  email: string;
  full_name: string;
}

export class NotificationsRepository {
  private async query<R extends QueryResultRow = QueryResultRow>(
    client: PoolClient | undefined,
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>> {
    if (client) {
      return client.query<R>(text, params);
    }
    return pool.query<R>(text, params);
  }

  // --------------------------------------------------------------------------
  // In-App Notifications
  // --------------------------------------------------------------------------

  public async createNotification(
    input: CreateNotificationInput,
    client?: PoolClient,
  ): Promise<NotificationResponse | null> {
    const sql = `
      INSERT INTO notifications (
        user_id, title, message, severity, channel, entity_type, entity_id, metadata, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING *;
    `;
    const params = [
      input.userId,
      input.title,
      input.message,
      input.severity,
      input.channel ?? 'IN_APP',
      input.entityType ?? null,
      input.entityId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.idempotencyKey ?? null,
    ];

    const res = await this.query(client, sql, params);
    return res.rows[0] ? this.mapNotificationRow(res.rows[0]) : null;
  }

  public async listNotificationsForUser(
    userId: string,
    filter: NotificationListFilter,
    client?: PoolClient,
  ): Promise<{ notifications: NotificationResponse[]; total: number; unreadCount: number }> {
    const conditions: string[] = ['user_id = $1'];
    const params: unknown[] = [userId];
    let pIdx = 2;

    if (filter.unreadOnly) {
      conditions.push('read_at IS NULL');
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Total matching filter
    const totalSql = `SELECT COUNT(*)::int AS count FROM notifications ${whereClause};`;
    const totalRes = await this.query<{ count: number }>(client, totalSql, params);
    const total = totalRes.rows[0]?.count ?? 0;

    // Unread count specifically for this user
    const unreadSql = `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL;`;
    const unreadRes = await this.query<{ count: number }>(client, unreadSql, [userId]);
    const unreadCount = unreadRes.rows[0]?.count ?? 0;

    // List paginated
    const listSql = `
      SELECT
        id, user_id, title, message, severity, channel, entity_type, entity_id,
        metadata, read_at, created_at, updated_at
      FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++};
    `;
    params.push(filter.limit, filter.offset);

    const listRes = await this.query(client, listSql, params);
    const notifications = listRes.rows.map(this.mapNotificationRow);

    return { notifications, total, unreadCount };
  }

  public async getNotificationById(
    id: string,
    userId: string,
    client?: PoolClient,
  ): Promise<NotificationResponse | null> {
    const sql = `
      SELECT
        id, user_id, title, message, severity, channel, entity_type, entity_id,
        metadata, read_at, created_at, updated_at
      FROM notifications
      WHERE id = $1 AND user_id = $2;
    `;
    const res = await this.query(client, sql, [id, userId]);
    return res.rows[0] ? this.mapNotificationRow(res.rows[0]) : null;
  }

  public async markAsRead(
    id: string,
    userId: string,
    client?: PoolClient,
  ): Promise<NotificationResponse | null> {
    const sql = `
      UPDATE notifications
      SET read_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND read_at IS NULL
      RETURNING *;
    `;
    const res = await this.query(client, sql, [id, userId]);
    return res.rows[0] ? this.mapNotificationRow(res.rows[0]) : null;
  }

  public async markAllAsRead(userId: string, client?: PoolClient): Promise<number> {
    const sql = `
      UPDATE notifications
      SET read_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND read_at IS NULL;
    `;
    const res = await this.query(client, sql, [userId]);
    return res.rowCount ?? 0;
  }

  // --------------------------------------------------------------------------
  // Email Deliveries
  // --------------------------------------------------------------------------

  public async createEmailDelivery(
    input: CreateEmailDeliveryInput,
    client?: PoolClient,
  ): Promise<EmailDeliveryResponse | null> {
    const sql = `
      INSERT INTO email_deliveries (
        notification_id, recipient_email, recipient_user_id, subject, body_text,
        body_html, artifact_id, report_run_id, idempotency_key, max_attempts
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING *;
    `;
    const params = [
      input.notificationId ?? null,
      input.recipientEmail,
      input.recipientUserId ?? null,
      input.subject,
      input.bodyText,
      input.bodyHtml ?? null,
      input.artifactId ?? null,
      input.reportRunId ?? null,
      input.idempotencyKey ?? null,
      input.maxAttempts ?? 3,
    ];

    const res = await this.query(client, sql, params);
    return res.rows[0] ? this.mapEmailDeliveryRow(res.rows[0]) : null;
  }

  public async claimDueDeliveries(
    limit: number,
    client: PoolClient,
  ): Promise<EmailDeliveryResponse[]> {
    const sql = `
      SELECT *
      FROM email_deliveries
      WHERE status IN ('PENDING', 'FAILED')
        AND attempt_count < max_attempts
        AND next_attempt_at <= NOW()
      ORDER BY next_attempt_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $1;
    `;
    const res = await client.query(sql, [limit]);
    return res.rows.map(this.mapEmailDeliveryRow);
  }

  public async markDeliverySending(id: string, client?: PoolClient): Promise<void> {
    const sql = `
      UPDATE email_deliveries
      SET status = 'SENDING', updated_at = NOW()
      WHERE id = $1;
    `;
    await this.query(client, sql, [id]);
  }

  public async markDeliverySent(id: string, client?: PoolClient): Promise<void> {
    const sql = `
      UPDATE email_deliveries
      SET status = 'SENT', sent_at = NOW(), last_error = NULL, updated_at = NOW()
      WHERE id = $1;
    `;
    await this.query(client, sql, [id]);
  }

  public async markDeliveryFailed(
    id: string,
    currentAttempts: number,
    maxAttempts: number,
    errorMessage: string,
    client?: PoolClient,
  ): Promise<void> {
    const nextAttempts = currentAttempts + 1;
    const isTerminal = nextAttempts >= maxAttempts;

    // Exponential backoff in minutes: 1m, 4m, 9m, etc.
    const backoffMinutes = Math.pow(nextAttempts, 2);

    const sql = `
      UPDATE email_deliveries
      SET
        status = 'FAILED',
        attempt_count = $2,
        next_attempt_at = CASE WHEN $3 = true THEN next_attempt_at ELSE NOW() + ($4 || ' minutes')::interval END,
        last_error = $5,
        updated_at = NOW()
      WHERE id = $1;
    `;
    await this.query(client, sql, [
      id,
      nextAttempts,
      isTerminal,
      backoffMinutes.toString(),
      errorMessage,
    ]);
  }

  public async getEligibleUsersForAlert(client?: PoolClient): Promise<EligibleUser[]> {
    // Notify ADMIN, QUALITY_MANAGER, and SUPERVISOR for critical and high alerts
    const targetRoles = ['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR'];

    const sql = `
      SELECT DISTINCT u.id, u.username, u.email, u.full_name
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE u.is_active = true
        AND r.name = ANY($1::text[])
      ORDER BY u.email ASC;
    `;
    const res = await this.query<UserRow>(client, sql, [targetRoles]);
    return res.rows.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      fullName: r.full_name,
    }));
  }

  // --------------------------------------------------------------------------
  // Row mappers
  // --------------------------------------------------------------------------

  private mapNotificationRow(row: QueryResultRow): NotificationResponse {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      title: row.title as string,
      message: row.message as string,
      severity: row.severity as NotificationSeverity,
      channel: row.channel as NotificationChannel,
      entityType: (row.entity_type as NotificationEntityType) ?? null,
      entityId: (row.entity_id as string) ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      readAt: row.read_at ? new Date(row.read_at as string).toISOString() : null,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapEmailDeliveryRow(row: QueryResultRow): EmailDeliveryResponse {
    return {
      id: row.id as string,
      notificationId: (row.notification_id as string) ?? null,
      recipientEmail: row.recipient_email as string,
      recipientUserId: (row.recipient_user_id as string) ?? null,
      subject: row.subject as string,
      bodyText: row.body_text as string,
      bodyHtml: (row.body_html as string) ?? null,
      status: row.status as EmailDeliveryStatus,
      attemptCount: Number(row.attempt_count),
      maxAttempts: Number(row.max_attempts),
      nextAttemptAt: new Date(row.next_attempt_at as string).toISOString(),
      sentAt: row.sent_at ? new Date(row.sent_at as string).toISOString() : null,
      lastError: (row.last_error as string) ?? null,
      artifactId: (row.artifact_id as string) ?? null,
      reportRunId: (row.report_run_id as string) ?? null,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }
}

export const notificationsRepository = new NotificationsRepository();
