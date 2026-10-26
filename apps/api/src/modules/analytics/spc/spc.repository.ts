import type { PoolClient } from 'pg';
import { pool } from '../../../infrastructure/database/pool.js';
import type { SpcPChartFilter } from '@qualityops/contracts';

export interface SpcSubgroupDbRow {
  id: string;
  inspection_number: string;
  batch_id: string;
  batch_number: string | null;
  inspected_at: Date;
  sample_size: number;
  failed_units: number;
  stage: string;
}

export interface SpcProcessContext {
  product: {
    id: string;
    code: string;
    name: string;
  };
  line: {
    id: string;
    name: string;
  };
  shift: {
    id: string;
    name: string;
  } | null;
}

export class SpcRepository {
  async getProcessContext(
    productId: string,
    productionLineId: string,
    shiftId?: string,
    client?: PoolClient,
  ): Promise<SpcProcessContext | null> {
    const productQuery = 'SELECT id, code, name FROM products WHERE id = $1';
    const lineQuery = 'SELECT id, name FROM production_lines WHERE id = $1';

    const [prodRes, lineRes] = await Promise.all([
      client ? client.query(productQuery, [productId]) : pool.query(productQuery, [productId]),
      client
        ? client.query(lineQuery, [productionLineId])
        : pool.query(lineQuery, [productionLineId]),
    ]);

    if (prodRes.rows.length === 0 || lineRes.rows.length === 0) {
      return null;
    }

    let shiftInfo: { id: string; name: string } | null = null;
    if (shiftId) {
      const shiftQuery = 'SELECT id, name FROM shifts WHERE id = $1';
      const shiftRes = client
        ? await client.query(shiftQuery, [shiftId])
        : await pool.query(shiftQuery, [shiftId]);
      if (shiftRes.rows.length > 0) {
        const s = shiftRes.rows[0];
        shiftInfo = { id: s.id, name: s.name };
      }
    }

    const p = prodRes.rows[0];
    const l = lineRes.rows[0];

    return {
      product: { id: p.id, code: p.code, name: p.name },
      line: { id: l.id, name: l.name },
      shift: shiftInfo,
    };
  }

  async getCompletedInspectionSubgroups(
    filter: SpcPChartFilter,
    client?: PoolClient,
  ): Promise<SpcSubgroupDbRow[]> {
    const query = `
      SELECT
        qi.id,
        qi.inspection_number,
        qi.batch_id,
        pb.batch_number,
        qi.inspected_at,
        qi.sample_size,
        qi.failed_units,
        qi.stage
      FROM quality_inspections qi
      JOIN production_batches pb ON qi.batch_id = pb.id
      WHERE pb.product_id = $1
        AND pb.production_line_id = $2
        AND qi.status = 'COMPLETED'
        AND qi.inspected_at >= $3
        AND qi.inspected_at <= $4
        AND ($5::uuid IS NULL OR pb.shift_id = $5)
        AND ($6::varchar IS NULL OR qi.stage = $6)
        AND qi.sample_size > 0
        AND qi.failed_units >= 0
        AND qi.failed_units <= qi.sample_size
      ORDER BY qi.inspected_at ASC, qi.inspection_number ASC
    `;

    const values = [
      filter.productId,
      filter.productionLineId,
      new Date(filter.from).toISOString(),
      new Date(filter.to).toISOString(),
      filter.shiftId || null,
      filter.inspectionStage || null,
    ];

    const result = client ? await client.query(query, values) : await pool.query(query, values);

    return result.rows.map((r) => ({
      id: r.id,
      inspection_number: r.inspection_number,
      batch_id: r.batch_id,
      batch_number: r.batch_number,
      inspected_at: new Date(r.inspected_at),
      sample_size: Number(r.sample_size),
      failed_units: Number(r.failed_units),
      stage: r.stage,
    }));
  }
}

export const spcRepository = new SpcRepository();
