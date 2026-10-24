import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  CreateProductRequestSchema,
  IdParamSchema,
  ProductListQuerySchema,
  UpdateProductRequestSchema,
} from '@qualityops/contracts';
import { productsService } from '../../modules/master-data/products/products.service.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { BadRequestError } from '../../middleware/error.middleware.js';

export const productsRouter = Router();

// Authentication required for all product endpoints
productsRouter.use(authenticate);

// GET /api/v1/master-data/products - List products (read-only for all canonical roles)
productsRouter.get(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ProductListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }

      const result = await productsService.list(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/master-data/products/:id - Get product by ID
productsRouter.get(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const item = await productsService.getById(idParsed.data.id);
      res.status(200).json({ item, product: item });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/master-data/products - Create product (ADMIN or QUALITY_MANAGER)
productsRouter.post(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateProductRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const item = await productsService.create(parsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(201).json({ item, product: item });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/master-data/products/:id - Update product (ADMIN or QUALITY_MANAGER)
productsRouter.patch(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      const bodyParsed = UpdateProductRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Validation error', bodyParsed.error.issues);
      }

      const item = await productsService.update(idParsed.data.id, bodyParsed.data, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ item, product: item });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/master-data/products/:id - Delete product (ADMIN or QUALITY_MANAGER)
productsRouter.delete(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParsed = IdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        throw new BadRequestError('Invalid ID parameter', idParsed.error.issues);
      }

      await productsService.delete(idParsed.data.id, {
        actorId: req.user?.id,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ message: 'Product deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);
