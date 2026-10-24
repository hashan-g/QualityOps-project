import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  CreateMachineRequestSchema,
  IdParamSchema,
  MachineListQuerySchema,
  UpdateMachineRequestSchema,
} from '@qualityops/contracts';
import { machinesService } from '../../modules/master-data/machines/machines.service.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { BadRequestError } from '../../middleware/error.middleware.js';

export const machinesRouter = Router();

machinesRouter.use(authenticate);

// GET /api/v1/master-data/machines - List machines
machinesRouter.get(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = MachineListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }

      const result = await machinesService.list(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/master-data/machines/:id - Get machine by ID
machinesRouter.get(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const item = await machinesService.getById(idParsed.data.id);
      res.status(200).json({ item, machine: item });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/master-data/machines - Create machine
machinesRouter.post(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateMachineRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const item = await machinesService.create(parsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(201).json({ item, machine: item });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/master-data/machines/:id - Update machine
machinesRouter.patch(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const bodyParsed = UpdateMachineRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Validation error', bodyParsed.error.issues);
      }

      const item = await machinesService.update(idParsed.data.id, bodyParsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ item, machine: item });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/master-data/machines/:id - Delete machine
machinesRouter.delete(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      await machinesService.delete(idParsed.data.id, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ message: 'Machine deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);
