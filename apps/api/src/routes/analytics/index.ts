import { Router } from 'express';
import { spcRouter } from './spc.router.js';

export const analyticsRouter = Router();

// Mount SPC analytics routes under /api/v1/analytics
analyticsRouter.use('/', spcRouter);
