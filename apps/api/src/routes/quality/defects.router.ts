import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  CreateDefectRecordRequestSchema,
  DefectAnalyticsFilterSchema,
  DefectRecordListQuerySchema,
  IdParamSchema,
  UpdateDefectRecordRequestSchema,
} from '@qualityops/contracts';
import { defectsService } from '../../modules/quality/defects/defects.service.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { BadRequestError } from '../../middleware/error.middleware.js';

export const defectsRouter = Router();

// Authentication required for all defect endpoints
defectsRouter.use(authenticate);

// GET /api/v1/quality/defects/analytics - Descriptive analytics aggregations
defectsRouter.get(
  '/analytics',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = DefectAnalyticsFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid analytics filter parameters', parsed.error.issues);
      }

      const analytics = await defectsService.getAnalytics(parsed.data);
      res.status(200).json(analytics);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/quality/defects - List defect findings with pagination & filters
defectsRouter.get(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = DefectRecordListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }

      const result = await defectsService.list(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/quality/defects/:id - Detail view for a specific defect finding
defectsRouter.get(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const item = await defectsService.getById(idParsed.data.id);
      res.status(200).json({ item, defect: item });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/quality/defects - Record defect finding (ADMIN, QUALITY_MANAGER, INSPECTOR)
defectsRouter.post(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'INSPECTOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateDefectRecordRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const item = await defectsService.create(parsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(201).json({ item, defect: item });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/quality/defects/:id - Authorized correction (ADMIN, QUALITY_MANAGER)
defectsRouter.patch(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const bodyParsed = UpdateDefectRecordRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Validation error', bodyParsed.error.issues);
      }

      const item = await defectsService.correct(idParsed.data.id, bodyParsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ item, defect: item });
    } catch (err) {
      next(err);
    }
  },
);
