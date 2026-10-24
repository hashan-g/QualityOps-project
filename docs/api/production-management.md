# QualityOps API Reference — Production Management

This document defines the HTTP REST API contracts, role-based access control (RBAC), database constraint reconciliation rules, lifecycle state transitions, and audit specifications for the Production Management module (Phase 5).

Base Route: `/api/v1/production`

---

## 1. Authentication & Role-Based Access Control (RBAC)

All endpoints under `/api/v1/production` require an authenticated session via a JWT Bearer token:

```http
Authorization: Bearer <accessToken>
```

### Authorization Matrix

| Endpoint              | Method  | Permitted Roles                                                                                                      | Description                                             |
| :-------------------- | :-----: | :------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------ |
| `/batches`            |  `GET`  | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER`                                          | List production batches with pagination and filtering   |
| `/batches/:id`        |  `GET`  | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER`                                          | Retrieve detailed batch status and quantities           |
| `/batches`            | `POST`  | `ADMIN`, `SUPERVISOR`, `OPERATOR`                                                                                    | Schedule and create a new production batch              |
| `/batches/:id`        | `PATCH` | `ADMIN`, `SUPERVISOR`, `OPERATOR` _(In-progress quantities)_<br>`ADMIN`, `SUPERVISOR` _(Complete / Cancel)_          | Update in-progress quantities or transition status      |
| `/batches/:id/status` | `PATCH` | `ADMIN`, `SUPERVISOR`, `OPERATOR` _(To IN_PROGRESS / ON_HOLD)_<br>`ADMIN`, `SUPERVISOR` _(To COMPLETED / CANCELLED)_ | Transition batch lifecycle status                       |
| `/downtime`           |  `GET`  | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER`                                          | List downtime events with line/machine/category filters |
| `/downtime/:id`       |  `GET`  | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER`                                          | Retrieve downtime event details                         |
| `/downtime`           | `POST`  | `ADMIN`, `SUPERVISOR`, `OPERATOR`                                                                                    | Log an equipment stoppage or line downtime event        |
| `/downtime/:id/close` | `PATCH` | `ADMIN`, `SUPERVISOR`, `OPERATOR`                                                                                    | Close an ongoing downtime event and record resolution   |
| `/downtime/:id`       | `PATCH` | `ADMIN`, `SUPERVISOR`, `OPERATOR`                                                                                    | Update downtime notes or category                       |

Unauthenticated requests return `401 Unauthorized`. Attempts by unauthorized roles return `403 Forbidden`. Historical batches and downtime events are immutable and non-destructive; no hard `DELETE` routes are exposed.

---

## 2. Quantity Semantics & Database Invariants

Phase 5 manages **whole-batch production quantities**. These quantities must not be conflated with later sample-based quality inspections or defect occurrence tallies.

### Canonical Quantities

- `planned_quantity`: Must be an integer strictly greater than zero (`> 0`).
- `produced_quantity`: Cumulative quantity manufactured to date (`>= 0`).
- `accepted_quantity`: Quantity passing all processing and dispositioned as accepted (`>= 0`).
- `scrap_quantity`: Quantity permanently rejected/scrapped (`>= 0`).
- `rework_pending_quantity`: Quantity quarantined for rework or reprocessing (`>= 0`).

### Check Constraints Enforced by Database

1. **Disposition Sum Constraint (`chk_batch_disposition_sum`)**:
   $$\text{accepted\_quantity} + \text{scrap\_quantity} + \text{rework\_pending\_quantity} \le \text{produced\_quantity}$$
   At any point during in-progress manufacturing, the sum of dispositioned units cannot exceed the total units produced.

2. **Completed Batch Reconciliation (`chk_batch_completed_reconciled`)**:
   $$\text{status} \ne \text{'COMPLETED'} \lor (\text{accepted\_quantity} + \text{scrap\_quantity} + \text{rework\_pending\_quantity} = \text{produced\_quantity})$$
   When a batch is marked `COMPLETED`, **every single unit produced must be fully accounted for and reconciled**. Incomplete reconciliation is rejected with a `400 Bad Request`.

3. **Batch Timestamps Ordering (`chk_batch_completed_after_started`)**:
   $$\text{completed\_at} \ge \text{started\_at}$$

---

## 3. Batch Lifecycle & Status Transitions

```
 [ PLANNED ] ───(Start)───> [ IN_PROGRESS ] <───(Resume)───> [ ON_HOLD ]
      │                            │                               │
      └───(Cancel)*                ├───(Complete)*                 └───(Cancel)*
            │                      │                                     │
            v                      v                                     v
      [ CANCELLED ]          [ COMPLETED ]                         [ CANCELLED ]
```

_\*Requires elevated role: `ADMIN` or `SUPERVISOR`._

- `PLANNED`: Initial batch state. Can transition to `IN_PROGRESS` or `CANCELLED`.
- `IN_PROGRESS`: Active production underway. Automatically stamps `started_at` if empty. Can transition to `ON_HOLD`, `COMPLETED`, or `CANCELLED`.
- `ON_HOLD`: Temporarily paused due to line delay, material shortage, or quality check. Can resume to `IN_PROGRESS` or transition to `CANCELLED`.
- `COMPLETED`: Terminal state. Automatically stamps `completed_at` if empty. Requires full quantity reconciliation.
- `CANCELLED`: Terminal state. Once cancelled, quantities and statuses cannot be modified.

---

## 4. Endpoints — Production Batches

### `GET /api/v1/production/batches`

List production batches with deterministic pagination and filtering.

**Query Parameters:**

- `page`: Integer $\ge 1$ (default `1`)
- `limit`: Integer $1 \dots 100$ (default `20`)
- `search`: Case-insensitive substring match against `batch_number`
- `productId`: UUID filter
- `productionLineId`: UUID filter
- `machineId`: UUID filter
- `shiftId`: UUID filter
- `status`: Filter by `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `ON_HOLD`
- `startDate`: ISO datetime string
- `endDate`: ISO datetime string

**Response (200 OK):**

```json
{
  "items": [
    {
      "id": "e1111111-1111-1111-1111-111111111111",
      "batchNumber": "BAT-2026-1042",
      "productId": "a1111111-1111-1111-1111-111111111111",
      "productCode": "PRD-PUMP-001",
      "productName": "Hydraulic Pump Assembly",
      "productionLineId": "b1111111-1111-1111-1111-111111111111",
      "productionLineCode": "LINE-01",
      "productionLineName": "Assembly Line 1",
      "shiftId": "d1111111-1111-1111-1111-111111111111",
      "shiftCode": "SHF-MORNING",
      "shiftName": "Morning Shift",
      "machineId": "c1111111-1111-1111-1111-111111111111",
      "machineCode": "MCH-001",
      "machineName": "CNC Center 1",
      "createdBy": "11111111-1111-1111-1111-111111111111",
      "createdByName": "Super Admin",
      "status": "IN_PROGRESS",
      "plannedQuantity": 500,
      "producedQuantity": 150,
      "acceptedQuantity": 140,
      "scrapQuantity": 5,
      "reworkPendingQuantity": 5,
      "startedAt": "2026-10-24T08:00:00.000Z",
      "completedAt": null,
      "createdAt": "2026-10-24T07:45:00.000Z",
      "updatedAt": "2026-10-24T10:15:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

### `GET /api/v1/production/batches/:id`

Retrieves a single production batch by UUID. Returns `404 Not Found` if the ID does not exist.

### `POST /api/v1/production/batches`

Creates and schedules a new batch.

- Validates that referenced Product, Production Line, and Shift exist and are active (`is_active = true`).
- If `machineId` is provided, verifies that it exists, is active, and belongs to the selected Production Line.
- Duplicate batch numbers are rejected with `409 Conflict`.

**Request Body:**

```json
{
  "batchNumber": "BAT-2026-1043",
  "productId": "a1111111-1111-1111-1111-111111111111",
  "productionLineId": "b1111111-1111-1111-1111-111111111111",
  "shiftId": "d1111111-1111-1111-1111-111111111111",
  "machineId": "c1111111-1111-1111-1111-111111111111",
  "plannedQuantity": 250,
  "status": "PLANNED"
}
```

### `PATCH /api/v1/production/batches/:id`

Updates operational quantities, re-assigns machine on the same line, or transitions status.

- Evaluates `chk_batch_disposition_sum` across effective quantities.
- If target status is `COMPLETED`, evaluates `chk_batch_completed_reconciled`.
- Transitioning to `COMPLETED` or `CANCELLED` is restricted to `ADMIN` and `SUPERVISOR`.

**Request Body Example (Progressive Count Update):**

```json
{
  "producedQuantity": 250,
  "acceptedQuantity": 240,
  "scrapQuantity": 6,
  "reworkPendingQuantity": 4,
  "status": "COMPLETED"
}
```

### `PATCH /api/v1/production/batches/:id/status`

Convenience endpoint for status-only transitions.

---

## 5. Endpoints — Downtime Records

The `downtime_records` table tracks operational stoppages. The `duration_seconds` column is a **PostgreSQL Generated Always Stored** column; client applications must never supply or update it directly.

### `GET /api/v1/production/downtime`

Lists equipment and line stoppages.

**Query Parameters:**

- `page`, `limit`
- `search`: Substring match on `reason`
- `productionLineId`: UUID filter
- `machineId`: UUID filter
- `batchId`: UUID filter
- `category`: Filter by `PLANNED` or `UNPLANNED`
- `startDate`, `endDate`: Datetime boundaries

### `POST /api/v1/production/downtime`

Logs a new stoppage.

- Validates that `productionLineId` exists.
- If `machineId` is provided, verifies that it belongs to `productionLineId`.
- If `batchId` is provided, verifies that it belongs to `productionLineId`.
- Requires `ended_at > started_at` if `ended_at` is supplied at creation.

**Request Body:**

```json
{
  "productionLineId": "b1111111-1111-1111-1111-111111111111",
  "machineId": "c1111111-1111-1111-1111-111111111111",
  "batchId": "e1111111-1111-1111-1111-111111111111",
  "reason": "Coolant pump thermal cutoff",
  "category": "UNPLANNED",
  "startedAt": "2026-10-24T14:30:00.000Z",
  "notes": "Sensor code E-402"
}
```

### `PATCH /api/v1/production/downtime/:id/close`

Closes an ongoing downtime event (`ended_at IS NULL`). Automatically sets `ended_at` (defaulting to current time if omitted) and calculates `duration_seconds` via PostgreSQL.

**Request Body:**

```json
{
  "endedAt": "2026-10-24T15:15:00.000Z",
  "notes": "Thermal sensor reset, coolant filter replaced"
}
```

---

## 6. Audit Logging & Security Assurance

Every successful create, update, status change, and closure writes an immutable record to `audit_logs`:

- `actor_id`: UUID of caller (`req.user.id`)
- `action`: `'CREATE'` | `'UPDATE'` | `'STATUS_CHANGE'` | `'CLOSE'`
- `entity_type`: `'PRODUCTION_BATCH'` | `'DOWNTIME_RECORD'`
- `entity_id`: UUID of the modified entity
- `request_id`: Tracing correlation identifier (`req.id`)
- `before_state`: Snapshot of prior state
- `after_state`: Snapshot of resulting state
- `ip_address`: Client IP address

Failed attempts (validation errors, 401, 403, 409 conflict, DB check violations) **never** generate audit rows, preventing false audit pollution.
