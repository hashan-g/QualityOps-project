import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { notificationsService } from '../../modules/notifications/notifications.service.js';
import { NotificationListFilterSchema } from '@qualityops/contracts';
import { BadRequestError } from '../../middleware/error.middleware.js';

export const notificationsRouter = Router();

// All notification endpoints require authentication
notificationsRouter.use(authenticate);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/notifications
 * List paginated notifications for current authenticated user with unread count.
 */
notificationsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedFilter = NotificationListFilterSchema.safeParse(req.query);
      if (!parsedFilter.success) {
        throw new BadRequestError(`Invalid query parameters: ${parsedFilter.error.message}`);
      }

      const { notifications, total, unreadCount } = await notificationsService.listNotifications(
        req.user!.id,
        parsedFilter.data,
      );

      res.status(200).json({
        notifications,
        total,
        unreadCount,
        limit: parsedFilter.data.limit,
        offset: parsedFilter.data.offset,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark one owned in-app notification as read.
 * Strict ownership enforcement: returns 404 if notification belongs to another user.
 */
notificationsRouter.patch(
  '/:id/read',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      if (!UUID_REGEX.test(id)) {
        throw new BadRequestError('Invalid notification identifier format; UUID required');
      }

      const notification = await notificationsService.markNotificationRead(id, req.user!.id);
      res.status(200).json({ notification });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/notifications/mark-all-read
 * Mark all unread notifications for the current authenticated user as read.
 */
notificationsRouter.post(
  '/mark-all-read',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { count } = await notificationsService.markAllNotificationsRead(req.user!.id);
      res.status(200).json({ count });
    } catch (err) {
      next(err);
    }
  },
);
