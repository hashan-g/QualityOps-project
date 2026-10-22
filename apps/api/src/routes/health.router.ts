import { Router } from 'express';
import type { Request, Response } from 'express';
import { HealthResponseSchema, type HealthResponse } from '@qualityops/contracts';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  const healthData: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'qualityops-api',
    version: '0.1.0',
  };

  // Ensure runtime validation against contracts schema
  const parsed = HealthResponseSchema.parse(healthData);
  res.status(200).json(parsed);
});
