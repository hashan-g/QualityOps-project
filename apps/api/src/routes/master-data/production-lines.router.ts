import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  CreateProductionLineRequestSchema,
  IdParamSchema,
  ProductionLineListQuerySchema,
  UpdateProductionLineRequestSchema,
} from '@qualityops/contracts';
import { productionLinesService } from '../../modules/master-data/production-lines/production-lines.service.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { BadRequestError } from '../../middleware/error.middleware.js';

export const productionLinesRouter = Router();

productionLinesRouter.use(authenticate);

// GET /api/v1/master-data/production-lines - List lines
productionLinesRouter.get(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ProductionLineListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }

      const result = await productionLinesService.list(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/master-data/production-lines/:id - Get line by ID
productionLinesRouter.get(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const item = await productionLinesService.getById(idParsed.data.id);
      res.status(200).json({ item, line: item });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/master-data/production-lines - Create line
productionLinesRouter.post(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateProductionLineRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const item = await productionLinesService.create(parsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(201).json({ item, line: item });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/master-data/production-lines/:id - Update line
productionLinesRouter.patch(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const bodyParsed = UpdateProductionLineRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Validation error', bodyParsed.error.issues);
      }

      const item = await productionLinesService.update(idParsed.data.id, bodyParsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ item, line: item });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/master-data/production-lines/:id - Delete line
productionLinesRouter.delete(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      await productionLinesService.delete(idParsed.data.id, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ message: 'Production line deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);
