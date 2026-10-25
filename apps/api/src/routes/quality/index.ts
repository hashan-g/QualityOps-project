import { Router } from 'express';
import { inspectionsRouter } from './inspections.router.js';
import { defectsRouter } from './defects.router.js';

export const qualityRouter = Router();

qualityRouter.use('/inspections', inspectionsRouter);
qualityRouter.use('/defects', defectsRouter);
