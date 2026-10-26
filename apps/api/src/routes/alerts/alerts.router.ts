import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { alertsService } from '../../modules/alerts/alerts.service.js';
import { AlertListFilterSchema, ResolveAlertSchema } from '@qualityops/contracts';
import { BadRequestError } from '../../middleware/error.middleware.js';

export const alertsRouter = Router();

// All alert endpoints require authentication
alertsRouter.use(authenticate);

/**
 * GET /api/v1/alerts
 * List paginated operational alerts with filtering by status, severity, ruleType (All roles).
 */
alertsRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsedFilter = AlertListFilterSchema.safeParse(req.query);
    if (!parsedFilter.success) {
      throw new BadRequestError(`Invalid query parameters: ${parsedFilter.error.message}`);
    }

    const { alerts, total } = await alertsService.listAlerts(parsedFilter.data);
    res.status(200).json({
      alerts,
      total,
      limit: parsedFilter.data.limit,
      offset: parsedFilter.data.offset,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/alerts/evaluate
 * Trigger bounded evaluation of all operational alert rules (ADMIN, QUALITY_MANAGER, SUPERVISOR).
 */
alertsRouter.post(
  '/evaluate',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR']),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await alertsService.evaluateAlerts();
      res.status(200).json({ result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/alerts/:id
 * Retrieve details of a single operational alert (All roles).
 */
alertsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const alert = await alertsService.getAlertById(req.params.id as string);
    res.status(200).json({ alert });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/alerts/:id/acknowledge
 * Acknowledge an active OPEN alert (ADMIN, QUALITY_MANAGER, SUPERVISOR, INSPECTOR).
 */
alertsRouter.post(
  '/:id/acknowledge',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await alertsService.acknowledgeAlert(req.params.id as string, req.user!.id);
      res.status(200).json({ alert: updated });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/alerts/:id/resolve
 * Resolve an alert with mandatory investigation/resolution notes (ADMIN, QUALITY_MANAGER, SUPERVISOR).
 */
alertsRouter.post(
  '/:id/resolve',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ResolveAlertSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(`Validation failed: ${parsed.error.message}`);
      }

      const updated = await alertsService.resolveAlert(
        req.params.id as string,
        req.user!.id,
        parsed.data.resolutionNotes,
      );
      res.status(200).json({ alert: updated });
    } catch (err) {
      next(err);
    }
  },
);
