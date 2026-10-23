import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  HealthResponseSchema,
  HealthReadinessResponseSchema,
  type HealthResponse,
  type HealthReadinessResponse,
} from '@qualityops/contracts';
import { checkDatabaseReadiness } from '../infrastructure/database/pool.js';

export const healthRouter = Router();

// Liveness check (independent of database availability)
healthRouter.get('/', (_req: Request, res: Response) => {
  const healthData: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'qualityops-api',
    version: '0.1.0',
  };

  const parsed = HealthResponseSchema.parse(healthData);
  res.status(200).json(parsed);
});

// Readiness check (actively verifies minimal database connectivity)
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const dbResult = await checkDatabaseReadiness();

  if (dbResult.ok) {
    const readinessData: HealthReadinessResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'qualityops-api',
      version: '0.1.0',
      database: {
        status: 'up',
        ...(dbResult.latencyMs !== undefined ? { latencyMs: dbResult.latencyMs } : {}),
      },
    };

    const parsed = HealthReadinessResponseSchema.parse(readinessData);
    res.status(200).json(parsed);
    return;
  }

  // Database is unreachable or query failed: return 503 Service Unavailable
  const degradedData: HealthReadinessResponse = {
    status: 'degraded',
    timestamp: new Date().toISOString(),
    service: 'qualityops-api',
    version: '0.1.0',
    database: {
      status: 'down',
      error: dbResult.error ?? 'Database check failed',
    },
  };

  const parsed = HealthReadinessResponseSchema.parse(degradedData);
  res.status(503).json(parsed);
});
