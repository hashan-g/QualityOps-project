import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  CreateShiftRequestSchema,
  IdParamSchema,
  ShiftListQuerySchema,
  UpdateShiftRequestSchema,
} from '@qualityops/contracts';
import { shiftsService } from '../../modules/master-data/shifts/shifts.service.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { BadRequestError } from '../../middleware/error.middleware.js';

export const shiftsRouter = Router();

shiftsRouter.use(authenticate);

// GET /api/v1/master-data/shifts - List shifts
shiftsRouter.get(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ShiftListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }

      const result = await shiftsService.list(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/master-data/shifts/:id - Get shift by ID
shiftsRouter.get(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const item = await shiftsService.getById(idParsed.data.id);
      res.status(200).json({ item, shift: item });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/master-data/shifts - Create shift
shiftsRouter.post(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateShiftRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const item = await shiftsService.create(parsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(201).json({ item, shift: item });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/master-data/shifts/:id - Update shift
shiftsRouter.patch(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const bodyParsed = UpdateShiftRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Validation error', bodyParsed.error.issues);
      }

      const item = await shiftsService.update(idParsed.data.id, bodyParsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ item, shift: item });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/master-data/shifts/:id - Delete shift
shiftsRouter.delete(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      await shiftsService.delete(idParsed.data.id, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ message: 'Shift deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);
