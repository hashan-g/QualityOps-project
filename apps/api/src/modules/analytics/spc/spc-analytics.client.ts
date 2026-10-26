import { config } from '../../../config.js';
import { ServiceUnavailableError } from '../../../middleware/error.middleware.js';
import type { SpcBaseline, SpcSummary, SpcPChartPoint, SpcStatus } from '@qualityops/contracts';

export interface SpcCalculationPayloadSubgroup {
  id: string;
  inspectionNumber: string;
  batchId: string;
  batchNumber: string | null;
  timestamp: string;
  sampleSize: number;
  failedUnits: number;
}

export interface SpcCalculationClientResponse {
  status: SpcStatus;
  baseline: SpcBaseline;
  summary: SpcSummary;
  points: SpcPChartPoint[];
  warnings: string[];
}

export class SpcAnalyticsClient {
  async calculatePChart(
    subgroups: SpcCalculationPayloadSubgroup[],
    minimumRequired = 20,
  ): Promise<SpcCalculationClientResponse> {
    const url = `${config.ANALYTICS_SERVICE_URL}/calculate/p-chart`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          subgroups,
          minimumRequired,
        }),
        signal: AbortSignal.timeout(config.ANALYTICS_SERVICE_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new ServiceUnavailableError(
          `Statistical analytics service returned an unexpected response (HTTP ${response.status})`,
          { status: response.status, body: errorText.slice(0, 200) },
        );
      }

      const data = (await response.json()) as SpcCalculationClientResponse;
      return data;
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        throw err;
      }

      // Mask internal network details/URLs while providing an actionable error message
      throw new ServiceUnavailableError(
        'Statistical analytics calculation service is temporarily unavailable. Please verify the SPC analytics service is running.',
        {
          cause: err instanceof Error ? err.name : 'UnknownError',
        },
      );
    }
  }
}

export const spcAnalyticsClient = new SpcAnalyticsClient();
