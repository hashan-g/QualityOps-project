import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { securityHeadersMiddleware } from './middleware/security-headers.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { healthRouter } from './routes/health.router.js';
import { authRouter } from './routes/auth.router.js';
import { usersRouter } from './routes/users.router.js';
import { masterDataRouter } from './routes/master-data/index.js';
import { productionRouter } from './routes/production/index.js';
import { qualityRouter } from './routes/quality/index.js';
import { analyticsRouter } from './routes/analytics/index.js';
import { reportsRouter } from './routes/reports/reports.router.js';
import { alertsRouter } from './routes/alerts/alerts.router.js';
import { notificationsRouter } from './routes/notifications/notifications.router.js';

export function createApp(): Express {
  const app = express();

  // Disable fingerprinting header
  app.disable('x-powered-by');

  // Baseline request correlation and security headers
  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);

  // CORS and body parsing with bounded limits
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser(config.COOKIE_SECRET));

  // Authentication & RBAC routes (Phase 3)
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);

  // Master Data Management routes (Phase 4)
  app.use('/api/v1/master-data', masterDataRouter);

  // Production Management routes (Phase 5)
  app.use('/api/v1/production', productionRouter);

  // Quality Inspection Management routes (Phase 6)
  app.use('/api/v1/quality', qualityRouter);

  // Advanced Analytics & Statistical Process Monitoring routes (Phase 9)
  app.use('/api/v1/analytics', analyticsRouter);

  // Reporting, Exports & Operational Alerts routes (Phase 10)
  app.use('/api/v1/reports', reportsRouter);
  app.use('/api/v1/alerts', alertsRouter);

  // Notifications & Email Delivery routes (Phase 12)
  app.use('/api/v1/notifications', notificationsRouter);

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
