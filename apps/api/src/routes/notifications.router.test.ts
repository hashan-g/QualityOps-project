import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { TokenService } from '../infrastructure/security/token.service.js';
import { notificationsRepository } from '../modules/notifications/notifications.repository.js';
import type { NotificationResponse } from '@qualityops/contracts';

describe('Notifications Router (/api/v1/notifications) — Integration Tests', () => {
  const app = createApp();

  const userAlice = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'alice_qm',
    email: 'alice@qualityops.local',
    password_hash: 'hash',
    full_name: 'Alice Quality Manager',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['QUALITY_MANAGER' as const],
  };

  const userBob = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'bob_operator',
    email: 'bob@qualityops.local',
    password_hash: 'hash',
    full_name: 'Bob Operator',
    is_active: true,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    roles: ['OPERATOR' as const],
  };

  let aliceToken: string;
  let bobToken: string;

  const sampleNotification: NotificationResponse = {
    id: '33333333-3333-3333-3333-333333333333',
    userId: userAlice.id,
    title: 'High Inspection Failure Rate Alert',
    message: 'Inspection #INS-001 has 35% failure rate',
    severity: 'CRITICAL',
    channel: 'IN_APP',
    entityType: 'OPERATIONAL_ALERT',
    entityId: '44444444-4444-4444-4444-444444444444',
    metadata: { failureRate: 0.35 },
    readAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(authRepository, 'findById').mockImplementation(async (id: string) => {
      if (id === userAlice.id) return userAlice;
      if (id === userBob.id) return userBob;
      return null;
    });

    aliceToken = TokenService.signAccessToken({
      userId: userAlice.id,
      username: userAlice.username,
      roles: userAlice.roles,
    }).token;

    bobToken = TokenService.signAccessToken({
      userId: userBob.id,
      username: userBob.username,
      roles: userBob.roles,
    }).token;
  });

  describe('GET /api/v1/notifications', () => {
    it('returns 401 Unauthorized when request lacks authentication token', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(401);
    });

    it('returns 200 with paginated notifications and unread count for current user', async () => {
      vi.spyOn(notificationsRepository, 'listNotificationsForUser').mockResolvedValue({
        notifications: [sampleNotification],
        total: 1,
        unreadCount: 1,
      });

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(1);
      expect(res.body.notifications[0].title).toBe('High Inspection Failure Rate Alert');
      expect(res.body.total).toBe(1);
      expect(res.body.unreadCount).toBe(1);
      expect(res.body.limit).toBe(20);
      expect(res.body.offset).toBe(0);
    });

    it('supports unreadOnly filter parameter', async () => {
      const listSpy = vi
        .spyOn(notificationsRepository, 'listNotificationsForUser')
        .mockResolvedValue({
          notifications: [sampleNotification],
          total: 1,
          unreadCount: 1,
        });

      const res = await request(app)
        .get('/api/v1/notifications?unreadOnly=true&limit=10&offset=5')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(listSpy).toHaveBeenCalledWith(
        userAlice.id,
        expect.objectContaining({
          unreadOnly: true,
          limit: 10,
          offset: 5,
        }),
      );
    });

    it('returns 400 Bad Request on out-of-bounds pagination parameters', async () => {
      const res = await request(app)
        .get('/api/v1/notifications?limit=500')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('returns 401 Unauthorized when request lacks authentication token', async () => {
      const res = await request(app).patch(`/api/v1/notifications/${sampleNotification.id}/read`);
      expect(res.status).toBe(401);
    });

    it('returns 400 Bad Request when id is not a valid UUID', async () => {
      const res = await request(app)
        .patch('/api/v1/notifications/invalid-uuid/read')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('UUID required');
    });

    it('returns 200 and marks owned notification as read', async () => {
      const readNotif: NotificationResponse = {
        ...sampleNotification,
        readAt: new Date().toISOString(),
      };

      vi.spyOn(notificationsRepository, 'markAsRead').mockResolvedValue(readNotif);

      const res = await request(app)
        .patch(`/api/v1/notifications/${sampleNotification.id}/read`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notification.readAt).toBeDefined();
    });

    it('prevents IDOR: returns 404 Not Found when attempting to read another user notification', async () => {
      // Bob attempts to mark Alice's notification as read
      vi.spyOn(notificationsRepository, 'markAsRead').mockResolvedValue(null);
      vi.spyOn(notificationsRepository, 'getNotificationById').mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/v1/notifications/${sampleNotification.id}/read`)
        .set('Authorization', `Bearer ${bobToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('not found');
    });
  });

  describe('POST /api/v1/notifications/mark-all-read', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      const res = await request(app).post('/api/v1/notifications/mark-all-read');
      expect(res.status).toBe(401);
    });

    it('returns 200 and marks all unread notifications for current user as read', async () => {
      const markAllSpy = vi.spyOn(notificationsRepository, 'markAllAsRead').mockResolvedValue(3);

      const res = await request(app)
        .post('/api/v1/notifications/mark-all-read')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(3);
      expect(markAllSpy).toHaveBeenCalledWith(userAlice.id);
    });
  });
});
