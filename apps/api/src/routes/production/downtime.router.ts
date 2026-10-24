import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  CloseDowntimeRequestSchema,
  CreateDowntimeRequestSchema,
  DowntimeListQuerySchema,
  IdParamSchema,
  UpdateDowntimeRequestSchema,
} from '@qualityops/contracts';
import { downtimeService } from '../../modules/production/downtime/downtime.service.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { BadRequestError } from '../../middleware/error.middleware.js';

export const downtimeRouter = Router();

downtimeRouter.use(authenticate);

// GET /api/v1/production/downtime - List downtime events
downtimeRouter.get(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = DowntimeListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }

      const result = await downtimeService.list(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/production/downtime/:id - Get downtime event by ID
downtimeRouter.get(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const item = await downtimeService.getById(idParsed.data.id);
      res.status(200).json({ item, downtime: item });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/production/downtime - Record downtime event (ADMIN, SUPERVISOR, OPERATOR)
downtimeRouter.post(
  '/',
  requireRole(['ADMIN', 'SUPERVISOR', 'OPERATOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateDowntimeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const item = await downtimeService.create(parsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(201).json({ item, downtime: item });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/production/downtime/:id/close - Close ongoing downtime event
downtimeRouter.patch(
  '/:id/close',
  requireRole(['ADMIN', 'SUPERVISOR', 'OPERATOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const body = req.body ?? {};
      const endedAt = body.endedAt || new Date().toISOString();

      const parsed = CloseDowntimeRequestSchema.safeParse({
        endedAt,
        notes: body.notes,
      });
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const item = await downtimeService.close(idParsed.data.id, parsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ item, downtime: item });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/production/downtime/:id - Update downtime details
downtimeRouter.patch(
  '/:id',
  requireRole(['ADMIN', 'SUPERVISOR', 'OPERATOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const parsed = UpdateDowntimeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const item = await downtimeService.update(idParsed.data.id, parsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ item, downtime: item });
    } catch (err) {
      next(err);
    }
  },
);
