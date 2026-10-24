import { Router } from 'express';
import { batchesRouter } from './batches.router.js';
import { downtimeRouter } from './downtime.router.js';

export const productionRouter = Router();

productionRouter.use('/batches', batchesRouter);
productionRouter.use('/downtime', downtimeRouter);
