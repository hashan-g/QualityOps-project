import { notificationsService } from '../modules/notifications/notifications.service.js';
import { pool } from '../infrastructure/database/pool.js';

async function main(): Promise<void> {
  console.log('[QualityOps Worker] Starting Pending Email Deliveries Processor...');
  const startTime = Date.now();

  try {
    const result = await notificationsService.processPendingEmailDeliveries();
    const elapsed = Date.now() - startTime;

    console.log(
      `[QualityOps Worker] Email Deliveries completed in ${elapsed}ms. Processed: ${result.processed}, Sent: ${result.sent}, Failed: ${result.failed}, Errors: ${result.errors.length}`,
    );

    if (result.errors.length > 0) {
      console.warn('[QualityOps Worker] Encountered errors during email delivery:');
      result.errors.forEach((e) => console.warn(`  - ${e}`));
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('[QualityOps Worker] Critical error processing email deliveries:', err);
    try {
      await pool.end();
    } catch {
      // Ignore pool shutdown error during abnormal exit
    }
    process.exit(1);
  }
}

void main();
