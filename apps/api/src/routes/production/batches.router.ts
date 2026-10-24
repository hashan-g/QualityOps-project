import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  CreateProductionBatchRequestSchema,
  IdParamSchema,
  ProductionBatchListQuerySchema,
  UpdateProductionBatchRequestSchema,
} from '@qualityops/contracts';
import { batchesService } from '../../modules/production/batches/batches.service.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { BadRequestError, ForbiddenError } from '../../middleware/error.middleware.js';

export const batchesRouter = Router();

batchesRouter.use(authenticate);

// GET /api/v1/production/batches - List batches with filters
batchesRouter.get(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ProductionBatchListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }

      const result = await batchesService.list(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/production/batches/:id - Get batch by ID
batchesRouter.get(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const item = await batchesService.getById(idParsed.data.id);
      res.status(200).json({ item, batch: item });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/production/batches - Create a new production batch (ADMIN, SUPERVISOR, OPERATOR)
batchesRouter.post(
  '/',
  requireRole(['ADMIN', 'SUPERVISOR', 'OPERATOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateProductionBatchRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const item = await batchesService.create(parsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(201).json({ item, batch: item });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/production/batches/:id - Update batch quantities or status
batchesRouter.patch(
  '/:id',
  requireRole(['ADMIN', 'SUPERVISOR', 'OPERATOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const bodyParsed = UpdateProductionBatchRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Validation error', bodyParsed.error.issues);
      }

      // Elevated role check: Completing or cancelling a batch requires ADMIN or SUPERVISOR
      if (bodyParsed.data.status === 'COMPLETED' || bodyParsed.data.status === 'CANCELLED') {
        const userRoles = req.user?.roles ?? [];
        const isElevated = userRoles.includes('ADMIN') || userRoles.includes('SUPERVISOR');
        if (!isElevated) {
          throw new ForbiddenError(
            'Only ADMIN and SUPERVISOR roles are permitted to complete or cancel a production batch',
          );
        }
      }

      const item = await batchesService.update(idParsed.data.id, bodyParsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ item, batch: item });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/production/batches/:id/status - Dedicated status transition endpoint
batchesRouter.patch(
  '/:id/status',
  requireRole(['ADMIN', 'SUPERVISOR', 'OPERATOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const { status } = req.body as { status?: string };
      if (!status) {
        throw new BadRequestError('Status parameter is required');
      }

      if (status === 'COMPLETED' || status === 'CANCELLED') {
        const userRoles = req.user?.roles ?? [];
        const isElevated = userRoles.includes('ADMIN') || userRoles.includes('SUPERVISOR');
        if (!isElevated) {
          throw new ForbiddenError(
            'Only ADMIN and SUPERVISOR roles are permitted to complete or cancel a production batch',
          );
        }
      }

      const bodyParsed = UpdateProductionBatchRequestSchema.safeParse({ status });
      if (!bodyParsed.success) {
        throw new BadRequestError('Invalid status value', bodyParsed.error.issues);
      }

      const item = await batchesService.update(idParsed.data.id, bodyParsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ item, batch: item });
    } catch (err) {
      next(err);
    }
  },
);
