import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { healthRouter } from './routes/health.router.js';
import { authRouter } from './routes/auth.router.js';
import { usersRouter } from './routes/users.router.js';
import { masterDataRouter } from './routes/master-data/index.js';
import { productionRouter } from './routes/production/index.js';
import { qualityRouter } from './routes/quality/index.js';

export function createApp(): Express {
  const app = express();

  // Basic middleware
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(cookieParser(config.COOKIE_SECRET));
  app.use(express.json());
  app.use(requestIdMiddleware);

  // Authentication & RBAC routes (Phase 3)
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);

  // Master Data Management routes (Phase 4)
  app.use('/api/v1/master-data', masterDataRouter);

  // Production Management routes (Phase 5)
  app.use('/api/v1/production', productionRouter);

  // Quality Inspection Management routes (Phase 6)
  app.use('/api/v1/quality', qualityRouter);

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
