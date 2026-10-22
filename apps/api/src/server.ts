import { app } from './app.js';
import { config } from './config.js';

const server = app.listen(config.API_PORT, () => {
  // Safe informational startup logging
  console.log(
    `[QualityOps API] Server listening on port ${config.API_PORT} in ${config.NODE_ENV} mode`,
  );
  console.log(`[QualityOps API] Health endpoint available at GET /api/v1/health`);
});

process.on('SIGTERM', () => {
  console.log('[QualityOps API] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[QualityOps API] Process terminated.');
  });
});

process.on('SIGINT', () => {
  console.log('[QualityOps API] SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('[QualityOps API] Process terminated.');
  });
});
