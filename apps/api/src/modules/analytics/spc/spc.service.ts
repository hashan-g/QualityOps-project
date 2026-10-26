import type { SpcPChartFilter, SpcPChartResponse } from '@qualityops/contracts';
import { NotFoundError } from '../../../middleware/error.middleware.js';
import { spcRepository } from './spc.repository.js';
import { spcAnalyticsClient } from './spc-analytics.client.js';

export class SpcService {
  async getPChart(filter: SpcPChartFilter): Promise<SpcPChartResponse> {
    // 1. Verify that the requested product and production line exist
    const context = await spcRepository.getProcessContext(
      filter.productId,
      filter.productionLineId,
      filter.shiftId,
    );

    if (!context) {
      throw new NotFoundError(
        'The specified product or production line was not found in master data records.',
      );
    }

    // 2. Fetch all completed, valid inspection subgroups within the bounded window
    const rows = await spcRepository.getCompletedInspectionSubgroups(filter);

    // 3. Prepare payload for the stateless statistical calculation service
    const subgroups = rows.map((r) => ({
      id: r.id,
      inspectionNumber: r.inspection_number,
      batchId: r.batch_id,
      batchNumber: r.batch_number,
      timestamp: r.inspected_at.toISOString(),
      sampleSize: r.sample_size,
      failedUnits: r.failed_units,
    }));

    // 4. Delegate statistical control limit calculations to the Python SPC engine
    const calcResult = await spcAnalyticsClient.calculatePChart(subgroups, 20);

    // 5. Build enriched response with process metadata and deterministic chronological points
    return {
      status: calcResult.status,
      filters: {
        productId: context.product.id,
        productCode: context.product.code,
        productName: context.product.name,
        productionLineId: context.line.id,
        productionLineName: context.line.name,
        shiftId: context.shift ? context.shift.id : filter.shiftId || null,
        shiftName: context.shift ? context.shift.name : null,
        inspectionStage: filter.inspectionStage || null,
        from: filter.from,
        to: filter.to,
      },
      baseline: calcResult.baseline,
      summary: calcResult.summary,
      points: calcResult.points,
      warnings: calcResult.warnings,
    };
  }
}

export const spcService = new SpcService();
