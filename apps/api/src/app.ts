import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { healthRouter } from './routes/health.router.js';

export function createApp(): Express {
  const app = express();

  // Basic middleware
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(requestIdMiddleware);

  // Health and readiness endpoints
  app.use('/api/v1/health', healthRouter);
  app.use('/health', healthRouter);

  // Convenience aliases for container orchestrators
  app.get('/ready', (req, res, next) => {
    req.url = '/ready';
    healthRouter(req, res, next);
  });

  // Fallback 404 and Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
