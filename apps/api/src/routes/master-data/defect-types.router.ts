import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  CreateDefectTypeRequestSchema,
  DefectTypeListQuerySchema,
  IdParamSchema,
  UpdateDefectTypeRequestSchema,
} from '@qualityops/contracts';
import { defectTypesService } from '../../modules/master-data/defect-types/defect-types.service.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { BadRequestError } from '../../middleware/error.middleware.js';

export const defectTypesRouter = Router();

defectTypesRouter.use(authenticate);

// GET /api/v1/master-data/defect-types - List defect types
defectTypesRouter.get(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = DefectTypeListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }

      const result = await defectTypesService.list(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/master-data/defect-types/:id - Get defect type by ID
defectTypesRouter.get(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const item = await defectTypesService.getById(idParsed.data.id);
      res.status(200).json({ item, defectType: item });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/master-data/defect-types - Create defect type
defectTypesRouter.post(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateDefectTypeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const item = await defectTypesService.create(parsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(201).json({ item, defectType: item });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/master-data/defect-types/:id - Update defect type
defectTypesRouter.patch(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const bodyParsed = UpdateDefectTypeRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Validation error', bodyParsed.error.issues);
      }

      const item = await defectTypesService.update(idParsed.data.id, bodyParsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ item, defectType: item });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/master-data/defect-types/:id - Delete defect type
defectTypesRouter.delete(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      await defectTypesService.delete(idParsed.data.id, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ message: 'Defect type deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);
