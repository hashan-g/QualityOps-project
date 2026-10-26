import type { PoolClient } from 'pg';
import { pool } from '../../../infrastructure/database/pool.js';
import type {
  CapaAction,
  CapaActionStatus,
  CapaActionType,
  CapaCase,
  CapaCaseListQuery,
  CapaPriority,
  CapaSource,
  CapaStatus,
  DefectSeverity,
} from '@qualityops/contracts';

export interface CreateCaseDbParams {
  caseNumber: string;
  title: string;
  description: string;
  source: CapaSource;
  priority: CapaPriority;
  batchId?: string | undefined;
  defectRecordId?: string | undefined;
  assignedTo?: string | undefined;
  createdBy: string;
  dueDate?: string | undefined;
  rootCause?: string | undefined;
}

export interface UpdateCaseDbParams {
  title?: string | undefined;
  description?: string | undefined;
  source?: CapaSource | undefined;
  priority?: CapaPriority | undefined;
  assignedTo?: string | null | undefined;
  dueDate?: string | null | undefined;
  rootCause?: string | null | undefined;
  status?: CapaStatus | undefined;
  verifiedBy?: string | null | undefined;
  verifiedAt?: string | null | undefined;
  verificationNotes?: string | null | undefined;
}

export interface CreateActionDbParams {
  capaCaseId: string;
  actionType: CapaActionType;
  description: string;
  assignedTo?: string | undefined;
  dueDate?: string | undefined;
}

export interface UpdateActionDbParams {
  description?: string | undefined;
  assignedTo?: string | null | undefined;
  dueDate?: string | null | undefined;
  status?: CapaActionStatus | undefined;
  completedAt?: string | null | undefined;
  completionNotes?: string | null | undefined;
}

export class CapaRepository {
  /**
   * Generates a deterministic, sequential case number in the format CAPA-YYYY-NNNN.
   */
  public async generateCaseNumber(client?: PoolClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CAPA-${year}-`;
    const res = client
      ? await client.query<{ next_val: string }>(
          `SELECT COALESCE(MAX(SUBSTRING(case_number FROM 'CAPA-[0-9]{4}-([0-9]+)')::integer), 0) + 1 AS next_val
           FROM capa_cases
           WHERE case_number LIKE $1;`,
          [`${prefix}%`],
        )
      : await pool.query<{ next_val: string }>(
          `SELECT COALESCE(MAX(SUBSTRING(case_number FROM 'CAPA-[0-9]{4}-([0-9]+)')::integer), 0) + 1 AS next_val
           FROM capa_cases
           WHERE case_number LIKE $1;`,
          [`${prefix}%`],
        );

    const nextVal = parseInt(res.rows[0]?.next_val ?? '1', 10);
    return `${prefix}${String(nextVal).padStart(4, '0')}`;
  }

  /**
   * Lists CAPA cases with server-side pagination, multi-criteria filtering, and stable deterministic sorting.
   */
  public async listCases(filters: CapaCaseListQuery): Promise<{
    items: CapaCase[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.max(1, Math.min(100, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.search) {
      whereClauses.push(
        `(c.case_number ILIKE $${paramIndex} OR c.title ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex})`,
      );
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.status) {
      whereClauses.push(`c.status = $${paramIndex}`);
      values.push(filters.status);
      paramIndex++;
    }

    if (filters.priority) {
      whereClauses.push(`c.priority = $${paramIndex}`);
      values.push(filters.priority);
      paramIndex++;
    }

    if (filters.source) {
      whereClauses.push(`c.source = $${paramIndex}`);
      values.push(filters.source);
      paramIndex++;
    }

    if (filters.assignedTo) {
      whereClauses.push(`c.assigned_to = $${paramIndex}`);
      values.push(filters.assignedTo);
      paramIndex++;
    }

    if (filters.batchId) {
      whereClauses.push(`c.batch_id = $${paramIndex}`);
      values.push(filters.batchId);
      paramIndex++;
    }

    if (filters.defectRecordId) {
      whereClauses.push(`c.defect_record_id = $${paramIndex}`);
      values.push(filters.defectRecordId);
      paramIndex++;
    }

    if (filters.overdue) {
      whereClauses.push(
        `c.status NOT IN ('CLOSED', 'CANCELLED') AND c.due_date IS NOT NULL AND c.due_date < CURRENT_DATE`,
      );
    }

    if (filters.startDate) {
      whereClauses.push(`c.created_at >= $${paramIndex}::timestamptz`);
      values.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      whereClauses.push(`c.created_at <= $${paramIndex}::timestamptz`);
      values.push(filters.endDate);
      paramIndex++;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count query
    const countQuery = `
      SELECT COUNT(*)::integer AS total
      FROM capa_cases c
      ${whereSql};
    `;
    const countRes = await pool.query<{ total: number }>(countQuery, values);
    const total = countRes.rows[0]?.total ?? 0;

    // Allowed sort columns
    const sortColumnMap: Record<string, string> = {
      created_at: 'c.created_at',
      due_date: 'c.due_date',
      case_number: 'c.case_number',
      priority: 'c.priority',
      status: 'c.status',
    };
    const sortCol = sortColumnMap[filters.sortBy ?? 'created_at'] ?? 'c.created_at';
    const sortOrder = filters.sortOrder?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const selectQuery = `
      SELECT
        c.id,
        c.case_number,
        c.title,
        c.description,
        c.source,
        c.priority,
        c.status,
        c.batch_id,
        pb.batch_number,
        c.defect_record_id,
        dt.defect_code,
        dt.defect_name,
        dt.severity AS defect_severity,
        qi.id AS inspection_id,
        qi.inspection_number,
        c.assigned_to,
        u_assigned.full_name AS assigned_to_name,
        u_assigned.username AS assigned_to_username,
        c.created_by,
        u_created.full_name AS created_by_name,
        TO_CHAR(c.due_date, 'YYYY-MM-DD') AS due_date,
        c.root_cause,
        c.verified_by,
        u_verified.full_name AS verified_by_name,
        c.verified_at,
        c.verification_notes,
        c.created_at,
        c.updated_at,
        COUNT(a.id)::integer AS action_count,
        COUNT(CASE WHEN a.status IN ('COMPLETED', 'VERIFIED') THEN 1 END)::integer AS completed_action_count,
        CASE
          WHEN c.status NOT IN ('CLOSED', 'CANCELLED') AND c.due_date IS NOT NULL AND c.due_date < CURRENT_DATE THEN true
          ELSE false
        END AS is_overdue
      FROM capa_cases c
      LEFT JOIN production_batches pb ON c.batch_id = pb.id
      LEFT JOIN defect_records dr ON c.defect_record_id = dr.id
      LEFT JOIN defect_types dt ON dr.defect_type_id = dt.id
      LEFT JOIN quality_inspections qi ON dr.inspection_id = qi.id
      LEFT JOIN users u_assigned ON c.assigned_to = u_assigned.id
      LEFT JOIN users u_created ON c.created_by = u_created.id
      LEFT JOIN users u_verified ON c.verified_by = u_verified.id
      LEFT JOIN capa_actions a ON c.id = a.capa_case_id
      ${whereSql}
      GROUP BY
        c.id, c.case_number, c.title, c.description, c.source, c.priority, c.status,
        c.batch_id, pb.batch_number, c.defect_record_id, dt.defect_code, dt.defect_name,
        dt.severity, qi.id, qi.inspection_number, c.assigned_to, u_assigned.full_name,
        u_assigned.username, c.created_by, u_created.full_name, c.due_date, c.root_cause,
        c.verified_by, u_verified.full_name, c.verified_at, c.verification_notes,
        c.created_at, c.updated_at
      ORDER BY ${sortCol} ${sortOrder}, c.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    values.push(limit, offset);
    const result = await pool.query<CapaCaseRow>(selectQuery, values);

    return {
      items: result.rows.map(mapCapaCaseRow),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Fetches an enriched CAPA case by UUID.
   */
  public async findCaseById(id: string, client?: PoolClient): Promise<CapaCase | null> {
    const query = `
      SELECT
        c.id,
        c.case_number,
        c.title,
        c.description,
        c.source,
        c.priority,
        c.status,
        c.batch_id,
        pb.batch_number,
        c.defect_record_id,
        dt.defect_code,
        dt.defect_name,
        dt.severity AS defect_severity,
        qi.id AS inspection_id,
        qi.inspection_number,
        c.assigned_to,
        u_assigned.full_name AS assigned_to_name,
        u_assigned.username AS assigned_to_username,
        c.created_by,
        u_created.full_name AS created_by_name,
        TO_CHAR(c.due_date, 'YYYY-MM-DD') AS due_date,
        c.root_cause,
        c.verified_by,
        u_verified.full_name AS verified_by_name,
        c.verified_at,
        c.verification_notes,
        c.created_at,
        c.updated_at,
        COUNT(a.id)::integer AS action_count,
        COUNT(CASE WHEN a.status IN ('COMPLETED', 'VERIFIED') THEN 1 END)::integer AS completed_action_count,
        CASE
          WHEN c.status NOT IN ('CLOSED', 'CANCELLED') AND c.due_date IS NOT NULL AND c.due_date < CURRENT_DATE THEN true
          ELSE false
        END AS is_overdue
      FROM capa_cases c
      LEFT JOIN production_batches pb ON c.batch_id = pb.id
      LEFT JOIN defect_records dr ON c.defect_record_id = dr.id
      LEFT JOIN defect_types dt ON dr.defect_type_id = dt.id
      LEFT JOIN quality_inspections qi ON dr.inspection_id = qi.id
      LEFT JOIN users u_assigned ON c.assigned_to = u_assigned.id
      LEFT JOIN users u_created ON c.created_by = u_created.id
      LEFT JOIN users u_verified ON c.verified_by = u_verified.id
      LEFT JOIN capa_actions a ON c.id = a.capa_case_id
      WHERE c.id = $1
      GROUP BY
        c.id, c.case_number, c.title, c.description, c.source, c.priority, c.status,
        c.batch_id, pb.batch_number, c.defect_record_id, dt.defect_code, dt.defect_name,
        dt.severity, qi.id, qi.inspection_number, c.assigned_to, u_assigned.full_name,
        u_assigned.username, c.created_by, u_created.full_name, c.due_date, c.root_cause,
        c.verified_by, u_verified.full_name, c.verified_at, c.verification_notes,
        c.created_at, c.updated_at;
    `;

    const res = client
      ? await client.query<CapaCaseRow>(query, [id])
      : await pool.query<CapaCaseRow>(query, [id]);
    return res.rows[0] ? mapCapaCaseRow(res.rows[0]) : null;
  }

  /**
   * Inserts a new CAPA case inside a transaction.
   */
  public async createCase(params: CreateCaseDbParams, client: PoolClient): Promise<string> {
    const query = `
      INSERT INTO capa_cases (
        case_number,
        title,
        description,
        source,
        priority,
        batch_id,
        defect_record_id,
        status,
        assigned_to,
        created_by,
        due_date,
        root_cause
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8, $9, $10, $11)
      RETURNING id;
    `;

    const res = await client.query<{ id: string }>(query, [
      params.caseNumber,
      params.title,
      params.description,
      params.source,
      params.priority,
      params.batchId ?? null,
      params.defectRecordId ?? null,
      params.assignedTo ?? null,
      params.createdBy,
      params.dueDate ?? null,
      params.rootCause ?? null,
    ]);

    return res.rows[0]!.id;
  }

  /**
   * Updates permitted fields of a CAPA case inside a transaction.
   */
  public async updateCase(
    id: string,
    params: UpdateCaseDbParams,
    client: PoolClient,
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [id];
    let paramIndex = 2;

    if (params.title !== undefined) {
      setClauses.push(`title = $${paramIndex}`);
      values.push(params.title);
      paramIndex++;
    }

    if (params.description !== undefined) {
      setClauses.push(`description = $${paramIndex}`);
      values.push(params.description);
      paramIndex++;
    }

    if (params.source !== undefined) {
      setClauses.push(`source = $${paramIndex}`);
      values.push(params.source);
      paramIndex++;
    }

    if (params.priority !== undefined) {
      setClauses.push(`priority = $${paramIndex}`);
      values.push(params.priority);
      paramIndex++;
    }

    if (params.assignedTo !== undefined) {
      setClauses.push(`assigned_to = $${paramIndex}`);
      values.push(params.assignedTo);
      paramIndex++;
    }

    if (params.dueDate !== undefined) {
      setClauses.push(`due_date = $${paramIndex}`);
      values.push(params.dueDate);
      paramIndex++;
    }

    if (params.rootCause !== undefined) {
      setClauses.push(`root_cause = $${paramIndex}`);
      values.push(params.rootCause);
      paramIndex++;
    }

    if (params.status !== undefined) {
      setClauses.push(`status = $${paramIndex}`);
      values.push(params.status);
      paramIndex++;
    }

    if (params.verifiedBy !== undefined) {
      setClauses.push(`verified_by = $${paramIndex}`);
      values.push(params.verifiedBy);
      paramIndex++;
    }

    if (params.verifiedAt !== undefined) {
      setClauses.push(`verified_at = $${paramIndex}`);
      values.push(params.verifiedAt);
      paramIndex++;
    }

    if (params.verificationNotes !== undefined) {
      setClauses.push(`verification_notes = $${paramIndex}`);
      values.push(params.verificationNotes);
      paramIndex++;
    }

    const query = `
      UPDATE capa_cases
      SET ${setClauses.join(', ')}
      WHERE id = $1;
    `;

    await client.query(query, values);
  }

  /**
   * Lists actions for a specific CAPA case.
   */
  public async listActionsByCaseId(caseId: string, client?: PoolClient): Promise<CapaAction[]> {
    const query = `
      SELECT
        a.id,
        a.capa_case_id,
        a.action_type,
        a.description,
        a.assigned_to,
        u.full_name AS assigned_to_name,
        u.username AS assigned_to_username,
        a.status,
        TO_CHAR(a.due_date, 'YYYY-MM-DD') AS due_date,
        a.completed_at,
        a.completion_notes,
        a.created_at,
        a.updated_at
      FROM capa_actions a
      LEFT JOIN users u ON a.assigned_to = u.id
      WHERE a.capa_case_id = $1
      ORDER BY a.created_at ASC, a.id ASC;
    `;

    const res = client
      ? await client.query<CapaActionRow>(query, [caseId])
      : await pool.query<CapaActionRow>(query, [caseId]);
    return res.rows.map(mapCapaActionRow);
  }

  /**
   * Finds an action by ID strictly belonging to the given case ID.
   */
  public async findActionById(
    caseId: string,
    actionId: string,
    client?: PoolClient,
  ): Promise<CapaAction | null> {
    const query = `
      SELECT
        a.id,
        a.capa_case_id,
        a.action_type,
        a.description,
        a.assigned_to,
        u.full_name AS assigned_to_name,
        u.username AS assigned_to_username,
        a.status,
        TO_CHAR(a.due_date, 'YYYY-MM-DD') AS due_date,
        a.completed_at,
        a.completion_notes,
        a.created_at,
        a.updated_at
      FROM capa_actions a
      LEFT JOIN users u ON a.assigned_to = u.id
      WHERE a.id = $1 AND a.capa_case_id = $2;
    `;

    const res = client
      ? await client.query<CapaActionRow>(query, [actionId, caseId])
      : await pool.query<CapaActionRow>(query, [actionId, caseId]);
    return res.rows[0] ? mapCapaActionRow(res.rows[0]) : null;
  }

  /**
   * Inserts a new CAPA action inside a transaction.
   */
  public async createAction(params: CreateActionDbParams, client: PoolClient): Promise<string> {
    const query = `
      INSERT INTO capa_actions (
        capa_case_id,
        action_type,
        description,
        assigned_to,
        status,
        due_date
      ) VALUES ($1, $2, $3, $4, 'PENDING', $5)
      RETURNING id;
    `;

    const res = await client.query<{ id: string }>(query, [
      params.capaCaseId,
      params.actionType,
      params.description,
      params.assignedTo ?? null,
      params.dueDate ?? null,
    ]);

    return res.rows[0]!.id;
  }

  /**
   * Updates an action belonging to the specified CAPA case.
   */
  public async updateAction(
    caseId: string,
    actionId: string,
    params: UpdateActionDbParams,
    client: PoolClient,
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [actionId, caseId];
    let paramIndex = 3;

    if (params.description !== undefined) {
      setClauses.push(`description = $${paramIndex}`);
      values.push(params.description);
      paramIndex++;
    }

    if (params.assignedTo !== undefined) {
      setClauses.push(`assigned_to = $${paramIndex}`);
      values.push(params.assignedTo);
      paramIndex++;
    }

    if (params.dueDate !== undefined) {
      setClauses.push(`due_date = $${paramIndex}`);
      values.push(params.dueDate);
      paramIndex++;
    }

    if (params.status !== undefined) {
      setClauses.push(`status = $${paramIndex}`);
      values.push(params.status);
      paramIndex++;
    }

    if (params.completedAt !== undefined) {
      setClauses.push(`completed_at = $${paramIndex}`);
      values.push(params.completedAt);
      paramIndex++;
    }

    if (params.completionNotes !== undefined) {
      setClauses.push(`completion_notes = $${paramIndex}`);
      values.push(params.completionNotes);
      paramIndex++;
    }

    const query = `
      UPDATE capa_actions
      SET ${setClauses.join(', ')}
      WHERE id = $1 AND capa_case_id = $2;
    `;

    await client.query(query, values);
  }

  /**
   * Counts actions for a case that are incomplete (not COMPLETED, VERIFIED, or CANCELLED).
   */
  public async countPendingActions(caseId: string, client?: PoolClient): Promise<number> {
    const query = `SELECT COUNT(*)::integer AS count
       FROM capa_actions
       WHERE capa_case_id = $1 AND status IN ('PENDING', 'IN_PROGRESS');`;
    const res = client
      ? await client.query<{ count: string }>(query, [caseId])
      : await pool.query<{ count: string }>(query, [caseId]);
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }

  /**
   * Counts total actions defined for a case.
   */
  public async countTotalActions(caseId: string, client?: PoolClient): Promise<number> {
    const query = `SELECT COUNT(*)::integer AS count
       FROM capa_actions
       WHERE capa_case_id = $1 AND status <> 'CANCELLED';`;
    const res = client
      ? await client.query<{ count: string }>(query, [caseId])
      : await pool.query<{ count: string }>(query, [caseId]);
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }
}

export const capaRepository = new CapaRepository();

interface CapaCaseRow {
  id: string;
  case_number: string;
  title: string;
  description: string;
  source: CapaSource;
  priority: CapaPriority;
  status: CapaStatus;
  batch_id: string | null;
  batch_number: string | null;
  defect_record_id: string | null;
  defect_code: string | null;
  defect_name: string | null;
  defect_severity: DefectSeverity | null;
  inspection_id: string | null;
  inspection_number: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_to_username: string | null;
  created_by: string;
  created_by_name: string | null;
  due_date: string | null;
  root_cause: string | null;
  verified_by: string | null;
  verified_by_name: string | null;
  verified_at: Date | null;
  verification_notes: string | null;
  created_at: Date;
  updated_at: Date;
  action_count: number;
  completed_action_count: number;
  is_overdue: boolean;
}

function mapCapaCaseRow(row: CapaCaseRow): CapaCase {
  return {
    id: row.id,
    caseNumber: row.case_number,
    title: row.title,
    description: row.description,
    source: row.source,
    priority: row.priority,
    status: row.status,
    batchId: row.batch_id ?? undefined,
    batchNumber: row.batch_number ?? undefined,
    defectRecordId: row.defect_record_id ?? undefined,
    defectCode: row.defect_code ?? undefined,
    defectName: row.defect_name ?? undefined,
    defectSeverity: row.defect_severity ?? undefined,
    inspectionId: row.inspection_id ?? undefined,
    inspectionNumber: row.inspection_number ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    assignedToName: row.assigned_to_name ?? undefined,
    assignedToUsername: row.assigned_to_username ?? undefined,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? undefined,
    dueDate: row.due_date ?? undefined,
    rootCause: row.root_cause ?? undefined,
    verifiedBy: row.verified_by ?? undefined,
    verifiedByName: row.verified_by_name ?? undefined,
    verifiedAt: row.verified_at ? row.verified_at.toISOString() : undefined,
    verificationNotes: row.verification_notes ?? undefined,
    actionCount: row.action_count,
    completedActionCount: row.completed_action_count,
    isOverdue: row.is_overdue,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

interface CapaActionRow {
  id: string;
  capa_case_id: string;
  action_type: CapaActionType;
  description: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_to_username: string | null;
  status: CapaActionStatus;
  due_date: string | null;
  completed_at: Date | null;
  completion_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapCapaActionRow(row: CapaActionRow): CapaAction {
  return {
    id: row.id,
    capaCaseId: row.capa_case_id,
    actionType: row.action_type,
    description: row.description,
    assignedTo: row.assigned_to ?? undefined,
    assignedToName: row.assigned_to_name ?? undefined,
    assignedToUsername: row.assigned_to_username ?? undefined,
    status: row.status,
    dueDate: row.due_date ?? undefined,
    completedAt: row.completed_at ? row.completed_at.toISOString() : undefined,
    completionNotes: row.completion_notes ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
