import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  CreateInspectionRequestSchema,
  IdParamSchema,
  InspectionListQuerySchema,
  UpdateInspectionRequestSchema,
} from '@qualityops/contracts';
import { inspectionsService } from '../../modules/quality/inspections/inspections.service.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { BadRequestError } from '../../middleware/error.middleware.js';

export const inspectionsRouter = Router();

// Authentication required for all inspection endpoints
inspectionsRouter.use(authenticate);

// GET /api/v1/quality/inspections - List inspections with filters & pagination
inspectionsRouter.get(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = InspectionListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }

      const result = await inspectionsService.list(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/quality/inspections/:id - Get detailed inspection by ID
inspectionsRouter.get(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const item = await inspectionsService.getById(idParsed.data.id);
      res.status(200).json({ item, inspection: item });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/quality/inspections - Create inspection (ADMIN, QUALITY_MANAGER, INSPECTOR)
inspectionsRouter.post(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'INSPECTOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateInspectionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const item = await inspectionsService.create(parsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(201).json({ item, inspection: item });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/quality/inspections/:id - Correct inspection (ADMIN, QUALITY_MANAGER)
inspectionsRouter.patch(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const bodyParsed = UpdateInspectionRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Validation error', bodyParsed.error.issues);
      }

      const item = await inspectionsService.correct(idParsed.data.id, bodyParsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ item, inspection: item });
    } catch (err) {
      next(err);
    }
  },
);
