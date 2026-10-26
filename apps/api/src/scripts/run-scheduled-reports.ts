import { reportsService } from '../modules/reports/reports.service.js';
import { pool } from '../infrastructure/database/pool.js';

async function main(): Promise<void> {
  console.log('[QualityOps Worker] Starting Scheduled Reports Due-Run Processor...');
  const startTime = Date.now();

  try {
    const result = await reportsService.processDueSchedules();
    const elapsed = Date.now() - startTime;

    console.log(
      `[QualityOps Worker] Scheduled Reports completed in ${elapsed}ms. Processed: ${result.processed}, Errors: ${result.errors.length}`,
    );

    if (result.errors.length > 0) {
      console.warn('[QualityOps Worker] Encountered errors during scheduled report execution:');
      result.errors.forEach((e) => console.warn(`  - ${e}`));
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('[QualityOps Worker] Critical error processing scheduled reports:', err);
    try {
      await pool.end();
    } catch {
      // Ignore pool shutdown error during abnormal exit
    }
    process.exit(1);
  }
}

void main();
