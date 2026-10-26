import { alertsService } from '../modules/alerts/alerts.service.js';
import { pool } from '../infrastructure/database/pool.js';

async function main(): Promise<void> {
  console.log('[QualityOps Worker] Starting Operational Alerts Evaluator...');
  const startTime = Date.now();

  try {
    const result = await alertsService.evaluateAlerts();
    const elapsed = Date.now() - startTime;

    console.log(
      `[QualityOps Worker] Operational Alerts evaluated in ${elapsed}ms. Evaluated Rules: ${result.evaluatedRules}, Alerts Generated: ${result.alertsGenerated}, Alerts Skipped (Deduplicated): ${result.alertsSkipped}, Errors: ${result.errors.length}`,
    );

    if (result.errors.length > 0) {
      console.warn('[QualityOps Worker] Encountered errors during alert evaluation:');
      result.errors.forEach((e) => console.warn(`  - ${e}`));
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('[QualityOps Worker] Critical error evaluating alerts:', err);
    try {
      await pool.end();
    } catch {
      // Ignore pool shutdown error during abnormal exit
    }
    process.exit(1);
  }
}

void main();
