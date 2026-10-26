import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../../infrastructure/database/pool.js';
import { alertsRepository, type AlertsRepository } from './alerts.repository.js';
import { spcService } from '../analytics/spc/spc.service.js';
import { config } from '../../config.js';
import type { AlertEvaluationResult } from '@qualityops/contracts';

export class AlertsEvaluator {
  constructor(private readonly repo: AlertsRepository = alertsRepository) {}

  private async query<R extends QueryResultRow = QueryResultRow>(
    client: PoolClient | undefined,
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>> {
    if (client) {
      return client.query<R>(text, params);
    }
    return pool.query<R>(text, params);
  }

  /**
   * Rule 1: High Inspection Failure Proportion.
   * Evaluates strictly completed inspections where sample_size > 0.
   */
  public async evaluateHighInspectionFailureRate(
    lookbackDays = config.ALERT_EVALUATION_LOOKBACK_DAYS,
    threshold = config.ALERT_INSPECTION_FAILURE_THRESHOLD,
    client?: PoolClient,
  ): Promise<{ generated: number; skipped: number }> {
    const sql = `
      SELECT
        qi.id,
        qi.inspection_number,
        qi.sample_size,
        qi.failed_units,
        (qi.failed_units::float / qi.sample_size) AS failure_rate,
        pb.batch_number,
        p.code AS product_code,
        pl.name AS line_name
      FROM quality_inspections qi
      JOIN production_batches pb ON qi.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      JOIN production_lines pl ON pb.production_line_id = pl.id
      WHERE qi.status = 'COMPLETED'
        AND qi.sample_size > 0
        AND (qi.failed_units::float / qi.sample_size) >= $1
        AND qi.inspected_at >= NOW() - ($2 || ' days')::interval;
    `;
    const res = await this.query(client, sql, [threshold, lookbackDays]);

    let generated = 0;
    let skipped = 0;

    for (const row of res.rows) {
      const failureRate = Number(row.failure_rate);
      const severity = failureRate >= 0.3 ? 'CRITICAL' : 'HIGH';
      const fingerprint = `HIGH_INSPECTION_FAILURE_RATE:${row.id}`;

      const created = await this.repo.createAlertIdempotent(
        {
          ruleType: 'HIGH_INSPECTION_FAILURE_RATE',
          severity,
          title: `High Inspection Failure Rate: ${row.inspection_number}`,
          message: `Inspection ${row.inspection_number} on ${row.line_name} recorded a ${(failureRate * 100).toFixed(1)}% failure rate (${row.failed_units}/${row.sample_size} units), exceeding threshold of ${(threshold * 100).toFixed(1)}%.`,
          fingerprint,
          entityType: 'QUALITY_INSPECTION',
          entityId: row.id,
          contextData: {
            inspectionId: row.id,
            inspectionNumber: row.inspection_number,
            batchNumber: row.batch_number,
            productCode: row.product_code,
            lineName: row.line_name,
            sampleSize: row.sample_size,
            failedUnits: row.failed_units,
            failureRate,
            threshold,
          },
        },
        client,
      );

      if (created) {
        generated++;
      } else {
        skipped++;
      }
    }

    return { generated, skipped };
  }

  /**
   * Rule 2: Overdue CAPA.
   * Evaluates open CAPA cases whose due date has passed. Excludes CLOSED and CANCELLED.
   */
  public async evaluateOverdueCapa(
    client?: PoolClient,
  ): Promise<{ generated: number; skipped: number }> {
    const sql = `
      SELECT
        cc.id,
        cc.case_number,
        cc.title,
        cc.priority,
        cc.status,
        cc.due_date,
        (CURRENT_DATE - cc.due_date)::int AS days_overdue,
        u.full_name AS assignee_name
      FROM capa_cases cc
      LEFT JOIN users u ON cc.assigned_to = u.id
      WHERE cc.due_date < CURRENT_DATE
        AND cc.status NOT IN ('CLOSED', 'CANCELLED');
    `;
    const res = await this.query(client, sql);

    let generated = 0;
    let skipped = 0;

    for (const row of res.rows) {
      const daysOverdue = Number(row.days_overdue);
      const severity =
        row.priority === 'CRITICAL' ? 'CRITICAL' : row.priority === 'HIGH' ? 'HIGH' : 'MEDIUM';
      const fingerprint = `OVERDUE_CAPA:${row.id}:${row.due_date}`;

      const created = await this.repo.createAlertIdempotent(
        {
          ruleType: 'OVERDUE_CAPA',
          severity,
          title: `Overdue CAPA Case: ${row.case_number}`,
          message: `CAPA Case ${row.case_number} ("${row.title}") is overdue by ${daysOverdue} day(s). Target resolution date was ${row.due_date}. Current status: ${row.status}, Priority: ${row.priority}.`,
          fingerprint,
          entityType: 'CAPA_CASE',
          entityId: row.id,
          contextData: {
            caseId: row.id,
            caseNumber: row.case_number,
            title: row.title,
            priority: row.priority,
            status: row.status,
            dueDate: String(row.due_date),
            daysOverdue,
            assigneeName: row.assignee_name,
          },
        },
        client,
      );

      if (created) {
        generated++;
      } else {
        skipped++;
      }
    }

    return { generated, skipped };
  }

  /**
   * Rule 3: SPC Out-of-Control Signal.
   * Evaluates active process streams. Generates alerts ONLY when SPC status is READY
   * and a point triggers ABOVE_UCL or BELOW_LCL. Never generates alerts for
   * INSUFFICIENT_DATA or DEGENERATE_BASELINE.
   */
  public async evaluateSpcOutOfControl(
    lookbackDays = config.ALERT_EVALUATION_LOOKBACK_DAYS,
    client?: PoolClient,
  ): Promise<{ generated: number; skipped: number; errors: string[] }> {
    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Find distinct active product + line combinations with recent completed inspections
    const distinctPairsSql = `
      SELECT DISTINCT pb.product_id, pb.production_line_id
      FROM quality_inspections qi
      JOIN production_batches pb ON qi.batch_id = pb.id
      WHERE qi.status = 'COMPLETED'
        AND qi.inspected_at >= NOW() - ($1 || ' days')::interval;
    `;
    const pairsRes = await this.query<{ product_id: string; production_line_id: string }>(
      client,
      distinctPairsSql,
      [lookbackDays],
    );

    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - lookbackDays * 86400000);

    for (const pair of pairsRes.rows) {
      try {
        const spcResult = await spcService.getPChart({
          productId: pair.product_id,
          productionLineId: pair.production_line_id,
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        });

        // Strictly evaluate only when status is READY
        if (spcResult.status !== 'READY') {
          continue;
        }

        for (const point of spcResult.points) {
          if (point.signal && point.signalReason) {
            const fingerprint = `SPC_OUT_OF_CONTROL:${point.inspectionId}:${point.signalReason}`;
            const severity = point.signalReason === 'ABOVE_UCL' ? 'HIGH' : 'MEDIUM';

            const created = await this.repo.createAlertIdempotent(
              {
                ruleType: 'SPC_OUT_OF_CONTROL',
                severity,
                title: `SPC Out-of-Control Signal: ${point.inspectionNumber}`,
                message: `Inspection ${point.inspectionNumber} proportion (${(point.observedProportion * 100).toFixed(2)}%) breached 3-sigma control limits (${point.signalReason}). UCL: ${point.upperControlLimit !== null ? (point.upperControlLimit * 100).toFixed(2) + '%' : 'N/A'}, LCL: ${point.lowerControlLimit !== null ? (point.lowerControlLimit * 100).toFixed(2) + '%' : 'N/A'}.`,
                fingerprint,
                entityType: 'QUALITY_INSPECTION',
                entityId: point.inspectionId,
                contextData: {
                  inspectionId: point.inspectionId,
                  inspectionNumber: point.inspectionNumber,
                  batchId: point.batchId,
                  sampleSize: point.sampleSize,
                  failedUnits: point.failedUnits,
                  observedProportion: point.observedProportion,
                  centerLine: point.centerLine,
                  upperControlLimit: point.upperControlLimit,
                  lowerControlLimit: point.lowerControlLimit,
                  signalReason: point.signalReason,
                  productId: pair.product_id,
                  productionLineId: pair.production_line_id,
                },
              },
              client,
            );

            if (created) {
              generated++;
            } else {
              skipped++;
            }
          }
        }
      } catch (err) {
        // Safe degraded handling: Do not throw or interrupt evaluation if analytics microservice is unavailable
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(
          `SPC evaluation failed for product ${pair.product_id}/line ${pair.production_line_id}: ${errMsg}`,
        );
      }
    }

    return { generated, skipped, errors };
  }

  /**
   * Evaluates all operational alert rules idempotently.
   */
  public async evaluateAll(): Promise<AlertEvaluationResult> {
    const errors: string[] = [];
    let alertsGenerated = 0;
    let alertsSkipped = 0;

    // Rule 1: High Inspection Failure Proportion
    try {
      const r1 = await this.evaluateHighInspectionFailureRate();
      alertsGenerated += r1.generated;
      alertsSkipped += r1.skipped;
    } catch (err) {
      errors.push(
        `High failure rate evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Rule 2: Overdue CAPA
    try {
      const r2 = await this.evaluateOverdueCapa();
      alertsGenerated += r2.generated;
      alertsSkipped += r2.skipped;
    } catch (err) {
      errors.push(
        `Overdue CAPA evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Rule 3: SPC Out of Control
    try {
      const r3 = await this.evaluateSpcOutOfControl();
      alertsGenerated += r3.generated;
      alertsSkipped += r3.skipped;
      errors.push(...r3.errors);
    } catch (err) {
      errors.push(
        `SPC alert evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      evaluatedRules: 3,
      alertsGenerated,
      alertsSkipped,
      errors,
    };
  }
}

export const alertsEvaluator = new AlertsEvaluator();
