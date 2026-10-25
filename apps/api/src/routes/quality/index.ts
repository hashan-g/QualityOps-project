import { Router } from 'express';
import { inspectionsRouter } from './inspections.router.js';

export const qualityRouter = Router();

qualityRouter.use('/inspections', inspectionsRouter);
