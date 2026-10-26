import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  CapaCaseListQuerySchema,
  CloseCapaCaseRequestSchema,
  CompleteCapaActionRequestSchema,
  CreateCapaActionRequestSchema,
  CreateCapaCaseRequestSchema,
  IdParamSchema,
  UpdateCapaActionRequestSchema,
  UpdateCapaCaseRequestSchema,
  VerifyCapaCaseRequestSchema,
} from '@qualityops/contracts';
import { capaService } from '../../modules/quality/capa/capa.service.js';
import { capaRepository } from '../../modules/quality/capa/capa.repository.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { BadRequestError } from '../../middleware/error.middleware.js';

export const capaRouter = Router();

// Authentication required for all CAPA endpoints
capaRouter.use(authenticate);

const ALL_ROLES = [
  'ADMIN',
  'QUALITY_MANAGER',
  'SUPERVISOR',
  'INSPECTOR',
  'OPERATOR',
  'VIEWER',
] as const;

// GET /api/v1/quality/capa - List CAPA cases
capaRouter.get(
  '/',
  requireRole([...ALL_ROLES]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CapaCaseListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }

      const result = await capaService.listCases(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/quality/capa - Create a new CAPA case
capaRouter.post(
  '/',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateCapaCaseRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid request payload', parsed.error.issues);
      }

      const created = await capaService.createCase(parsed.data, req.user!, {
        requestId: req.id,
        ipAddress: req.ip,
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/quality/capa/:id - Retrieve case detail and actions
capaRouter.get(
  '/:id',
  requireRole([...ALL_ROLES]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = IdParamSchema.safeParse(req.params);
      if (!parsed.success) {
        throw new BadRequestError('Invalid CAPA case ID format');
      }

      const detail = await capaService.getCaseDetail(parsed.data.id);
      res.status(200).json(detail);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/quality/capa/:id - Update permitted fields of a case
capaRouter.patch(
  '/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const paramParsed = IdParamSchema.safeParse(req.params);
      if (!paramParsed.success) {
        throw new BadRequestError('Invalid CAPA case ID format');
      }

      const bodyParsed = UpdateCapaCaseRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Invalid update payload', bodyParsed.error.issues);
      }

      const updated = await capaService.updateCase(
        paramParsed.data.id,
        bodyParsed.data,
        req.user!,
        {
          requestId: req.id,
          ipAddress: req.ip,
        },
      );
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/quality/capa/:id/verify - Record independent verification outcome
capaRouter.post(
  '/:id/verify',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const paramParsed = IdParamSchema.safeParse(req.params);
      if (!paramParsed.success) {
        throw new BadRequestError('Invalid CAPA case ID format');
      }

      const bodyParsed = VerifyCapaCaseRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Invalid verification payload', bodyParsed.error.issues);
      }

      const result = await capaService.verifyCase(paramParsed.data.id, bodyParsed.data, req.user!, {
        requestId: req.id,
        ipAddress: req.ip,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/quality/capa/:id/close - Close case when preconditions are satisfied
capaRouter.post(
  '/:id/close',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const paramParsed = IdParamSchema.safeParse(req.params);
      if (!paramParsed.success) {
        throw new BadRequestError('Invalid CAPA case ID format');
      }

      const bodyParsed = CloseCapaCaseRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Invalid closure payload', bodyParsed.error.issues);
      }

      const closed = await capaService.closeCase(
        paramParsed.data.id,
        req.user!,
        bodyParsed.data.closureNotes,
        {
          requestId: req.id,
          ipAddress: req.ip,
        },
      );
      res.status(200).json(closed);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/quality/capa/:id/actions - List actions for a case
capaRouter.get(
  '/:id/actions',
  requireRole([...ALL_ROLES]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const paramParsed = IdParamSchema.safeParse(req.params);
      if (!paramParsed.success) {
        throw new BadRequestError('Invalid CAPA case ID format');
      }

      const actions = await capaRepository.listActionsByCaseId(paramParsed.data.id);
      res.status(200).json(actions);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/quality/capa/:id/actions - Add action to a case
capaRouter.post(
  '/:id/actions',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const paramParsed = IdParamSchema.safeParse(req.params);
      if (!paramParsed.success) {
        throw new BadRequestError('Invalid CAPA case ID format');
      }

      const bodyParsed = CreateCapaActionRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Invalid action payload', bodyParsed.error.issues);
      }

      const action = await capaService.createAction(
        paramParsed.data.id,
        bodyParsed.data,
        req.user!,
        {
          requestId: req.id,
          ipAddress: req.ip,
        },
      );
      res.status(201).json(action);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/quality/capa/:id/actions/:actionId - Update action (enforces server-side ownership)
capaRouter.patch(
  '/:id/actions/:actionId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caseParam = IdParamSchema.safeParse({ id: req.params.id });
      const actionParam = IdParamSchema.safeParse({ id: req.params.actionId });
      if (!caseParam.success || !actionParam.success) {
        throw new BadRequestError('Invalid UUID format in parameters');
      }

      const bodyParsed = UpdateCapaActionRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Invalid update payload', bodyParsed.error.issues);
      }

      const updated = await capaService.updateAction(
        caseParam.data.id,
        actionParam.data.id,
        bodyParsed.data,
        req.user!,
        {
          requestId: req.id,
          ipAddress: req.ip,
        },
      );
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/quality/capa/:id/actions/:actionId/complete - Mark action complete with notes
capaRouter.post(
  '/:id/actions/:actionId/complete',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caseParam = IdParamSchema.safeParse({ id: req.params.id });
      const actionParam = IdParamSchema.safeParse({ id: req.params.actionId });
      if (!caseParam.success || !actionParam.success) {
        throw new BadRequestError('Invalid UUID format in parameters');
      }

      const bodyParsed = CompleteCapaActionRequestSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new BadRequestError('Invalid completion payload', bodyParsed.error.issues);
      }

      const completed = await capaService.completeAction(
        caseParam.data.id,
        actionParam.data.id,
        bodyParsed.data,
        req.user!,
        {
          requestId: req.id,
          ipAddress: req.ip,
        },
      );
      res.status(200).json(completed);
    } catch (err) {
      next(err);
    }
  },
);
