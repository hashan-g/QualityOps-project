import { Router, type Request, type Response, type NextFunction } from 'express';
import { SpcPChartFilterSchema } from '@qualityops/contracts';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { BadRequestError } from '../../middleware/error.middleware.js';
import { spcService } from '../../modules/analytics/spc/spc.service.js';

export const spcRouter = Router();

// Apply global authentication to SPC analytics endpoints
spcRouter.use(authenticate);

/**
 * GET /api/v1/analytics/quality/spc/p-chart
 * Generates p-chart proportion control limits and 3-sigma signal detection
 * for completed inspection subgroups.
 * Read Access: All 6 canonical roles.
 */
spcRouter.get(
  '/quality/spc/p-chart',
  requireRole(['ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = SpcPChartFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid SPC filter parameters', parsed.error.issues);
      }

      const result = await spcService.getPChart(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);
