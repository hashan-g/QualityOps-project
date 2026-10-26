# QualityOps API Reference — Corrective and Preventive Action (CAPA) Management (Phase 8)

This document defines the HTTP REST API contracts, role-based access control (RBAC), verification rules, closure preconditions, action isolation, and audit logging specifications for the CAPA Management module (Phase 8).

Base Route: `/api/v1/quality/capa`

---

## 1. Authentication & Role-Based Access Control (RBAC)

All endpoints under `/api/v1/quality/capa` require an authenticated session via a JWT Bearer token:

```http
Authorization: Bearer <accessToken>
```

### Authorization Matrix

| Endpoint                                              |  Method  | Permitted Roles                                                             | Description                                                       |
| :---------------------------------------------------- | :------: | :-------------------------------------------------------------------------- | :---------------------------------------------------------------- |
| `/api/v1/quality/capa`                                |  `GET`   | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER` | List CAPA cases with pagination, search, and multi-filters        |
| `/api/v1/quality/capa/:id`                            |  `GET`   | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER` | Retrieve CAPA case details with actions and source references     |
| `/api/v1/quality/capa`                                |  `POST`  | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`                                    | Register a new CAPA case linked to finding/batch                  |
| `/api/v1/quality/capa/:id`                            | `PATCH`  | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`                                    | Update case details, root cause, priority, or lifecycle status    |
| `/api/v1/quality/capa/:id/actions`                    |  `POST`  | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`                                    | Add a corrective, preventive, or containment action to a case     |
| `/api/v1/quality/capa/:id/actions/:actionId`          | `PATCH`  | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`                                    | Update action description, status, due date, or assignee          |
| `/api/v1/quality/capa/:id/actions/:actionId/complete` |  `POST`  | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, or **Assigned Action Owner**      | Complete an action with required completion notes and evidence    |
| `/api/v1/quality/capa/:id/verify`                     |  `POST`  | `ADMIN`, `QUALITY_MANAGER`                                                  | Record formal verification evaluation (`PASS` / `FAIL`)           |
| `/api/v1/quality/capa/:id/close`                      |  `POST`  | `ADMIN`, `QUALITY_MANAGER`                                                  | Close verified CAPA case with mandatory closure notes             |
| `/api/v1/quality/capa/:id`                            | `DELETE` | _None_                                                                      | **FORBIDDEN**: Historical quality records cannot be deleted (404) |

- **Unauthenticated requests** return `401 Unauthorized`.
- **Unauthorized roles** return `403 Forbidden`.
- **Action Owner Autonomy**: An assigned action owner (regardless of role) is authorized to complete their own assigned action via `POST /actions/:actionId/complete`. Non-managers cannot complete other users' actions.
- **Independent Verifier Invariant**: An action owner who implemented any action on a CAPA case cannot act as the verifier for that case (preventing self-verification of corrective actions). Only an independent Quality Manager or an Administrator can verify.
- **Strict Non-Destructive Invariant**: Historical CAPA records and action history cannot be deleted. No `DELETE` endpoint is exposed (returns `404 Not Found`).

---

## 2. Invariants & Business Logic

### Case Numbering Convention

Cases receive a sequential, human-readable identifier formatted as:
$$\text{CAPA-YYYY-NNNN}$$
e.g. `CAPA-2026-0001`. Generation is synchronized within the transaction against current year records.

### Lifecycle Status State Machine

- Permitted case statuses: `OPEN`, `IN_PROGRESS`, `UNDER_REVIEW`, `CLOSED`, `CANCELLED`.
- `PATCH /api/v1/quality/capa/:id` permits transitions between `OPEN`, `IN_PROGRESS`, `UNDER_REVIEW`, and `CANCELLED`.
- **Direct transition to `CLOSED` via `PATCH` is strictly prohibited**; requests attempting `status: "CLOSED"` are rejected with `400 Bad Request`.
- Controlled closure must occur exclusively through `POST /api/v1/quality/capa/:id/close`.

### Action Parent-Child Isolation

Every action operation validates that `capa_action.capa_case_id === :id`. If an action exists but belongs to a different case, the API responds with `404 Not Found` to prevent cross-case data leakage or unauthorized manipulation.

### Auto-Transition to `UNDER_REVIEW`

When an action is completed, the system checks whether all actions belonging to the case are now in `COMPLETED` or `VERIFIED` status. If so, and the case status is currently `OPEN` or `IN_PROGRESS`, the case is automatically progressed to `UNDER_REVIEW`.

### Preconditions for Verification (`POST /:id/verify`)

1. Case status must not be `CLOSED` or `CANCELLED`.
2. Case must have at least one action registered.
3. 100% of actions must be `COMPLETED` or `VERIFIED` (`countPendingActions === 0`).
4. Verifier cannot be an action owner on this case (unless caller holds the `ADMIN` role).
5. If `outcome: "PASS"`, `verified_by` and `verified_at` are recorded on the case, and status moves to `UNDER_REVIEW` (ready for closure).
6. If `outcome: "FAIL"`, verification notes are recorded, `verified_by` / `verified_at` remain null, and status transitions back to `IN_PROGRESS`.

### Preconditions for Closure (`POST /:id/close`)

1. Case status must not already be `CLOSED` or `CANCELLED`.
2. Case must have at least one action (`countTotalActions > 0`).
3. 100% of actions must be completed (`countPendingActions === 0`).
4. Case must have a recorded passing verification (`verified_by IS NOT NULL` and `verified_at IS NOT NULL`).
5. Mandatory closure notes must be provided (`min(5)` characters).
6. State transitions to `CLOSED`.

### Atomic Transactional Audit Logging

Every case creation, case update, action creation, action update, action completion, verification, and closure writes an immutable record to `audit_logs` in the **same database transaction**:

- Entity types: `CAPA_CASE`, `CAPA_ACTION`
- Actions: `CREATE`, `UPDATE`, `VERIFY`, `CLOSE`
- Metadata: `before` and `after` snapshots, actor ID, client IP, user agent.
- If any audit insert or constraint fails, the entire transaction rolls back.

---

## 3. Endpoints Specification

### 3.1 List CAPA Cases

`GET /api/v1/quality/capa`

Query Parameters:

- `page` (optional integer, default `1`)
- `limit` (optional integer, default `20`, max `100`)
- `search` (optional string, matches `case_number` or `title`)
- `status` (optional `OPEN` | `IN_PROGRESS` | `UNDER_REVIEW` | `CLOSED` | `CANCELLED`)
- `priority` (optional `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`)
- `source` (optional `INSPECTION_FAILURE` | `INTERNAL_AUDIT` | `CUSTOMER_COMPLAINT` | `RECURRING_DEFECT` | `PROCESS_DEVIATION`)
- `overdue` (optional boolean, filters cases where `due_date < CURRENT_DATE` and status not closed/cancelled)

Response (`200 OK`):

```json
{
  "items": [
    {
      "id": "7f8b3c10-9b48-4e12-b184-7a19d45e128f",
      "caseNumber": "CAPA-2026-0001",
      "title": "Seal Integrity Degradation on Packaging Line 2",
      "description": "Recurring heat seal pressure loss detected during stage-gate inspection.",
      "source": "INSPECTION_FAILURE",
      "priority": "HIGH",
      "batchId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "defectRecordId": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
      "status": "IN_PROGRESS",
      "assignedTo": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
      "createdBy": "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a",
      "dueDate": "2026-11-15",
      "rootCause": "Pneumatic actuator micro-leak causing gradual pressure bleed.",
      "verifiedBy": null,
      "verifiedAt": null,
      "verificationNotes": null,
      "createdAt": "2026-10-26T08:00:00.000Z",
      "updatedAt": "2026-10-26T08:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 3.2 Create CAPA Case

`POST /api/v1/quality/capa`

Headers:

- `Content-Type: application/json`
- `Authorization: Bearer <accessToken>`

Request Body:

```json
{
  "title": "Seal Integrity Degradation on Packaging Line 2",
  "description": "Recurring heat seal pressure loss detected during stage-gate inspection.",
  "source": "INSPECTION_FAILURE",
  "priority": "HIGH",
  "batchId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "defectRecordId": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
  "assignedTo": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
  "dueDate": "2026-11-15",
  "rootCause": "Preliminary investigation underway."
}
```

Response (`201 Created`):

```json
{
  "id": "7f8b3c10-9b48-4e12-b184-7a19d45e128f",
  "caseNumber": "CAPA-2026-0001",
  "title": "Seal Integrity Degradation on Packaging Line 2",
  "description": "Recurring heat seal pressure loss detected during stage-gate inspection.",
  "source": "INSPECTION_FAILURE",
  "priority": "HIGH",
  "batchId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "defectRecordId": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
  "status": "OPEN",
  "assignedTo": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
  "createdBy": "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a",
  "dueDate": "2026-11-15",
  "rootCause": "Preliminary investigation underway.",
  "verifiedBy": null,
  "verifiedAt": null,
  "verificationNotes": null,
  "createdAt": "2026-10-26T08:00:00.000Z",
  "updatedAt": "2026-10-26T08:00:00.000Z"
}
```

### 3.3 Get CAPA Case Detail

`GET /api/v1/quality/capa/:id`

Response (`200 OK`):
Returns the case record, joined source defect details, linked batch information, assignee details, and an array of all associated `actions`.

### 3.4 Update CAPA Case

`PATCH /api/v1/quality/capa/:id`

Request Body:

```json
{
  "title": "Updated Title",
  "priority": "CRITICAL",
  "status": "IN_PROGRESS",
  "rootCause": "Defective intake solenoid valve identified via 5-Why analysis."
}
```

Response (`200 OK`):
Returns updated case record.

### 3.5 Create Action

`POST /api/v1/quality/capa/:id/actions`

Request Body:

```json
{
  "actionType": "CORRECTIVE",
  "description": "Replace pneumatic seal valve and recalibrate line pressure sensors.",
  "assignedTo": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
  "dueDate": "2026-11-05"
}
```

Response (`201 Created`):

```json
{
  "id": "e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
  "capaCaseId": "7f8b3c10-9b48-4e12-b184-7a19d45e128f",
  "actionType": "CORRECTIVE",
  "description": "Replace pneumatic seal valve and recalibrate line pressure sensors.",
  "assignedTo": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
  "status": "PENDING",
  "dueDate": "2026-11-05",
  "completedAt": null,
  "completionNotes": null,
  "createdAt": "2026-10-26T08:15:00.000Z",
  "updatedAt": "2026-10-26T08:15:00.000Z"
}
```

### 3.6 Complete Action

`POST /api/v1/quality/capa/:id/actions/:actionId/complete`

Request Body:

```json
{
  "completionNotes": "Replaced valve assembly with certified OEM component. Sensor recalibrated to 4.2 bar."
}
```

Response (`200 OK`):
Returns updated action record with `status: "COMPLETED"` and populated `completedAt`.

### 3.7 Verify CAPA Case

`POST /api/v1/quality/capa/:id/verify`

Request Body:

```json
{
  "outcome": "PASS",
  "notes": "Post-maintenance 200-unit trial completed. Zero seal integrity failures observed."
}
```

Response (`200 OK`):
Returns case with updated verification metadata and status.

### 3.8 Close CAPA Case

`POST /api/v1/quality/capa/:id/close`

Request Body:

```json
{
  "closureNotes": "Root cause eradicated. Preventive line inspection frequency updated in PM schedule."
}
```

Response (`200 OK`):
Returns closed case record with `status: "CLOSED"`.
