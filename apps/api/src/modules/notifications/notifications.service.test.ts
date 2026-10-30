import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MockEmailTransport } from './transports/mock-email.transport.js';
import {
  DisabledEmailTransport,
  EmailDeliveryDisabledError,
} from './transports/email-transport.factory.js';
import { NotificationsService } from './notifications.service.js';
import type { NotificationsRepository } from './notifications.repository.js';
import type {
  NotificationResponse,
  OperationalAlert,
  ReportRunResponse,
  ScheduledReportResponse,
  EmailDeliveryResponse,
} from '@qualityops/contracts';

describe('Phase 12: Notifications & Email Delivery Service Tests', () => {
  let mockTransport: MockEmailTransport;

  beforeEach(() => {
    mockTransport = new MockEmailTransport();
  });

  describe('MockEmailTransport & DisabledEmailTransport', () => {
    it('records dispatched emails and generates unique message IDs', async () => {
      const result = await mockTransport.sendMail({
        to: 'quality.lead@company.local',
        subject: 'Weekly QA Digest',
        text: 'Report body text',
      });

      expect(result.messageId).toContain('@qualityops.local');
      expect(result.accepted).toEqual(['quality.lead@company.local']);

      const recorded = mockTransport.getSentEmails();
      expect(recorded).toHaveLength(1);
      expect(recorded[0]?.to).toBe('quality.lead@company.local');
      expect(recorded[0]?.subject).toBe('Weekly QA Digest');
    });

    it('simulates transient transport failures and recovers', async () => {
      mockTransport.setFailNext(new Error('Connection timeout to SMTP gateway'));

      await expect(
        mockTransport.sendMail({
          to: 'lead@company.local',
          subject: 'Test',
          text: 'Body',
        }),
      ).rejects.toThrow('Connection timeout to SMTP gateway');

      // Subsequent send succeeds
      const result = await mockTransport.sendMail({
        to: 'lead@company.local',
        subject: 'Retry',
        text: 'Body',
      });
      expect(result.accepted).toEqual(['lead@company.local']);
    });

    it('DisabledEmailTransport throws explicit EmailDeliveryDisabledError', async () => {
      const disabled = new DisabledEmailTransport();
      await expect(
        disabled.sendMail({ to: 'user@test.local', subject: 'A', text: 'B' }),
      ).rejects.toThrow(EmailDeliveryDisabledError);

      const verified = await disabled.verify();
      expect(verified).toBe(false);
    });
  });

  describe('NotificationsService In-App Workflows', () => {
    const userId1 = randomUUID();
    const userId2 = randomUUID();

    const sampleNotifications: NotificationResponse[] = [
      {
        id: randomUUID(),
        userId: userId1,
        title: 'Alert: High Failure Rate',
        message: 'Inspection #INS-001 exceeded 30% failure',
        severity: 'CRITICAL',
        channel: 'IN_APP',
        entityType: 'OPERATIONAL_ALERT',
        entityId: randomUUID(),
        metadata: { failureRate: 0.35 },
        readAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        userId: userId1,
        title: 'Report Ready',
        message: 'Scheduled PDF report generated',
        severity: 'INFO',
        channel: 'IN_APP',
        entityType: 'REPORT_RUN',
        entityId: randomUUID(),
        metadata: {},
        readAt: '2026-10-29T10:00:00.000Z',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    it('lists user notifications with correct total and unread count', async () => {
      const mockRepo = {
        listNotificationsForUser: async (_uid: string, filter: { unreadOnly?: boolean }) => {
          const list = filter.unreadOnly
            ? sampleNotifications.filter((n) => !n.readAt)
            : sampleNotifications;
          return {
            notifications: list,
            total: list.length,
            unreadCount: sampleNotifications.filter((n) => !n.readAt).length,
          };
        },
      } as unknown as NotificationsRepository;

      const service = new NotificationsService(mockRepo);
      const all = await service.listNotifications(userId1, { limit: 20, offset: 0 });
      expect(all.total).toBe(2);
      expect(all.unreadCount).toBe(1);

      const unread = await service.listNotifications(userId1, {
        limit: 20,
        offset: 0,
        unreadOnly: true,
      });
      expect(unread.total).toBe(1);
    });

    it('enforces ownership and throws NotFoundError on IDOR attempts to read another user notification', async () => {
      const mockRepo = {
        getNotificationById: async (id: string, uid: string) => {
          if (uid === userId2) {
            return null; // IDOR: user 2 does not own user 1's notification
          }
          return sampleNotifications[0];
        },
      } as unknown as NotificationsRepository;

      const service = new NotificationsService(mockRepo);

      // Access by rightful owner succeeds
      const owned = await service.getNotificationById(sampleNotifications[0]!.id, userId1);
      expect(owned.id).toBe(sampleNotifications[0]!.id);

      // Access by different user fails with 404 NotFound
      await expect(
        service.getNotificationById(sampleNotifications[0]!.id, userId2),
      ).rejects.toThrow('not found');
    });

    it('marks owned notification as read idempotently', async () => {
      const targetNotif = sampleNotifications[0]!;
      const updated = { ...targetNotif, readAt: new Date().toISOString() };

      const mockRepo = {
        markAsRead: async (_id: string, _uid: string) => updated,
      } as unknown as NotificationsRepository;

      const service = new NotificationsService(mockRepo);
      const res = await service.markNotificationRead(targetNotif.id, userId1);
      expect(res.readAt).toBeDefined();
    });

    it('marks all unread notifications as read for current user', async () => {
      const mockRepo = {
        markAllAsRead: async (_uid: string) => 5,
      } as unknown as NotificationsRepository;

      const service = new NotificationsService(mockRepo);
      const res = await service.markAllNotificationsRead(userId1);
      expect(res.count).toBe(5);
    });
  });

  describe('Alert Dispatch Integration', () => {
    it('dispatches in-app notifications and email intent for CRITICAL and HIGH alerts', async () => {
      let createdInApp = 0;
      let createdEmail = 0;

      const mockRepo = {
        getEligibleUsersForAlert: async () => [
          {
            id: 'u1',
            username: 'admin',
            email: 'admin@qualityops.local',
            fullName: 'Platform Admin',
          },
          {
            id: 'u2',
            username: 'qmanager',
            email: 'qm@qualityops.local',
            fullName: 'Quality Manager',
          },
        ],
        createNotification: async () => {
          createdInApp++;
          return {} as NotificationResponse;
        },
        createEmailDelivery: async () => {
          createdEmail++;
          return {} as EmailDeliveryResponse;
        },
      } as unknown as NotificationsRepository;

      const service = new NotificationsService(mockRepo);

      const criticalAlert: OperationalAlert = {
        id: randomUUID(),
        ruleType: 'HIGH_INSPECTION_FAILURE_RATE',
        severity: 'CRITICAL',
        status: 'OPEN',
        title: 'Critical Failure Rate: INS-999',
        message: '35% failed units observed',
        fingerprint: 'HIGH_INSPECTION_FAILURE_RATE:999',
        entityType: 'QUALITY_INSPECTION',
        entityId: randomUUID(),
        contextData: {},
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolvedBy: null,
        resolvedAt: null,
        resolutionNotes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await service.dispatchAlertNotifications(criticalAlert);
      expect(result.inAppCreated).toBe(2);
      expect(result.emailDeliveriesQueued).toBe(2);
      expect(createdInApp).toBe(2);
      expect(createdEmail).toBe(2);
    });

    it('ignores LOW and MEDIUM alerts for email dispatch', async () => {
      let createdInApp = 0;
      let createdEmail = 0;

      const mockRepo = {
        createNotification: async () => {
          createdInApp++;
          return {} as NotificationResponse;
        },
        createEmailDelivery: async () => {
          createdEmail++;
          return {} as EmailDeliveryResponse;
        },
      } as unknown as NotificationsRepository;

      const service = new NotificationsService(mockRepo);

      const lowAlert: OperationalAlert = {
        id: randomUUID(),
        ruleType: 'SPC_OUT_OF_CONTROL',
        severity: 'LOW',
        status: 'OPEN',
        title: 'Minor shift',
        message: 'Info',
        fingerprint: 'SPC:LOW:1',
        entityType: 'QUALITY_INSPECTION',
        entityId: randomUUID(),
        contextData: {},
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolvedBy: null,
        resolvedAt: null,
        resolutionNotes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await service.dispatchAlertNotifications(lowAlert);
      expect(result.inAppCreated).toBe(0);
      expect(result.emailDeliveriesQueued).toBe(0);
      expect(createdInApp).toBe(0);
      expect(createdEmail).toBe(0);
    });
  });

  describe('Scheduled Report Email Dispatch', () => {
    it('queues email deliveries for configured recipients', async () => {
      let createdCount = 0;

      const mockRepo = {
        createEmailDelivery: async (input: { recipientEmail: string }) => {
          createdCount++;
          return {
            id: randomUUID(),
            recipientEmail: input.recipientEmail,
          } as EmailDeliveryResponse;
        },
      } as unknown as NotificationsRepository;

      const service = new NotificationsService(mockRepo);

      const run: ReportRunResponse = {
        id: randomUUID(),
        scheduledReportId: randomUUID(),
        reportType: 'production-performance',
        format: 'PDF',
        filters: {},
        status: 'SUCCEEDED',
        artifactId: randomUUID(),
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const schedule: ScheduledReportResponse = {
        id: randomUUID(),
        name: 'Weekly Plant Report',
        reportType: 'production-performance',
        filters: {},
        format: 'PDF',
        cadence: 'WEEKLY',
        timezone: 'UTC',
        isEnabled: true,
        createdBy: randomUUID(),
        nextRunAt: new Date().toISOString(),
        lastRunAt: null,
        recipients: ['supervisor@factory.local', 'ops.manager@factory.local'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await service.dispatchScheduledReportDelivery(run, schedule);
      expect(result.queuedCount).toBe(2);
      expect(createdCount).toBe(2);
    });

    it('returns zero queued count if schedule has no recipients', async () => {
      const mockRepo = {
        createEmailDelivery: async () => ({}) as EmailDeliveryResponse,
      } as unknown as NotificationsRepository;

      const service = new NotificationsService(mockRepo);

      const run: ReportRunResponse = {
        id: randomUUID(),
        scheduledReportId: randomUUID(),
        reportType: 'production-performance',
        format: 'PDF',
        filters: {},
        status: 'SUCCEEDED',
        artifactId: randomUUID(),
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const scheduleWithoutRecipients: ScheduledReportResponse = {
        id: randomUUID(),
        name: 'Local Only Report',
        reportType: 'production-performance',
        filters: {},
        format: 'PDF',
        cadence: 'WEEKLY',
        timezone: 'UTC',
        isEnabled: true,
        createdBy: randomUUID(),
        nextRunAt: new Date().toISOString(),
        lastRunAt: null,
        recipients: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await service.dispatchScheduledReportDelivery(run, scheduleWithoutRecipients);
      expect(result.queuedCount).toBe(0);
    });
  });
});
