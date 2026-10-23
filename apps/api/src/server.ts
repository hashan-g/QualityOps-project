import { app } from './app.js';
import { config } from './config.js';
import { closePool } from './infrastructure/database/pool.js';

const server = app.listen(config.API_PORT, () => {
  // Safe informational startup logging
  console.log(
    `[QualityOps API] Server listening on port ${config.API_PORT} in ${config.NODE_ENV} mode`,
  );
  console.log(`[QualityOps API] Health liveness available at GET /api/v1/health`);
  console.log(`[QualityOps API] Health readiness available at GET /api/v1/health/ready`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[QualityOps API] ${signal} received, shutting down gracefully...`);
  server.close(async () => {
    try {
      await closePool();
      console.log('[QualityOps API] Database pool closed.');
    } catch (err) {
      console.error('[QualityOps API] Error closing database pool:', err);
    } finally {
      console.log('[QualityOps API] Process terminated.');
    }
  });
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
