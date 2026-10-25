# QualityOps API Reference — Quality Inspection Management (Phase 6)

This document defines the HTTP REST API contracts, role-based access control (RBAC), sample integrity rules, database constraints, and audit specifications for the Quality Inspection Management module (Phase 6).

Base Route: `/api/v1/quality/inspections`

---

## 1. Authentication & Role-Based Access Control (RBAC)

All endpoints under `/api/v1/quality/inspections` require an authenticated session via a JWT Bearer token:

```http
Authorization: Bearer <accessToken>
```

### Authorization Matrix

| Endpoint                          |  Method  | Permitted Roles                                                             | Description                                                    |
| :-------------------------------- | :------: | :-------------------------------------------------------------------------- | :------------------------------------------------------------- |
| `/api/v1/quality/inspections`     |  `GET`   | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER` | List quality inspections with pagination, search, and filters  |
| `/api/v1/quality/inspections/:id` |  `GET`   | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER` | Retrieve detailed quality inspection by ID with joined context |
| `/api/v1/quality/inspections`     |  `POST`  | `ADMIN`, `QUALITY_MANAGER`, `INSPECTOR`                                     | Record a new quality inspection event against a batch          |
| `/api/v1/quality/inspections/:id` | `PATCH`  | `ADMIN`, `QUALITY_MANAGER`                                                  | Controlled correction of an existing inspection with reason    |
| `/api/v1/quality/inspections/:id` | `DELETE` | _None_                                                                      | **FORBIDDEN**: Historical inspection records cannot be deleted |

- **Unauthenticated requests** return `401 Unauthorized`.
- **Unauthorized roles** return `403 Forbidden`.
- **Inspector Identity**: Derived automatically from the authenticated session (`req.user.id`). Never trusted from client body input.
- **Strict Non-Destructive Invariant**: Submitted inspection records are immutable and non-destructive. No `DELETE` endpoint is exposed (returns `404 Not Found`).

---

## 2. Measurement Semantics & Sample Rules

### Sample vs. Production Disposition Isolation

- **Batch Disposition Quantities** (`accepted_quantity`, `scrap_quantity`, `rework_pending_quantity`) represent cumulative physical production disposition for an entire batch.
- **Inspection Sample Size & Counts** (`sample_size`, `passed_units`, `failed_units`) represent discrete verification measurements evaluated on a sample cohort.
- **Cardinal Rule**: Quality inspection sample outcomes **NEVER** alter or mutate production batch disposition quantities.

### Batch Eligibility

Inspections can only be recorded on batches actively in progress, held for quality verification, or finished:

- **Eligible Statuses**: `IN_PROGRESS`, `ON_HOLD`, `COMPLETED`.
- **Ineligible Statuses**: `PLANNED` (no units manufactured yet) and `CANCELLED` (abandoned batch) return `400 Bad Request`.

### Database Invariants & Check Constraints

1. **Sample Invariant (`chk_inspection_units_sum`)**:
   $$\text{passed\_units} + \text{failed\_units} \le \text{sample\_size}$$
2. **Completed Inspection Full Reconciliation (`chk_inspection_completed_reconciled`)**:
   $$\text{status} \ne \text{'COMPLETED'} \lor (\text{passed\_units} + \text{failed\_units} = \text{sample\_size})$$
   When an inspection is marked `COMPLETED`, every sampled unit must be fully accounted for as either passed or failed.
3. **Completed Result Obligation (`chk_inspection_completed_result`)**:
   $$\text{status} \ne \text{'COMPLETED'} \lor \text{result} \text{ IS NOT NULL}$$
4. **Unique Stage & Attempt (`uq_inspection_batch_stage_attempt`)**:
   UNIQUE (`batch_id`, `stage`, `attempt_number`). Retries or re-inspections must increment the attempt counter.
5. **Sample Bound vs. Produced Quantity**:
   $$\text{sample\_size} \le \text{batch.produced\_quantity}$$
   A sample size cannot exceed the cumulative units produced by the batch at the time of inspection.
6. **Server Result Derivation & Contradiction Rejection**:
   - If no result is specified by the client, the server auto-derives:
     - `failed_units === 0 ? 'PASS' : 'FAIL'`
   - If a client supplies `result: 'PASS'` when `failed_units > 0`, the server strictly rejects the request with `400 Bad Request`.

---

## 3. Transactional Audit Logging

All inspection creations and corrections participate in the same PostgreSQL transaction:

- **Creation**: Audits `action: 'CREATE'`, `entityType: 'QUALITY_INSPECTION'`, actor ID, entity ID, and state snapshot.
- **Correction**: Audits `action: 'CORRECTION'`, `entityType: 'QUALITY_INSPECTION'`, actor ID, entity ID, before-state snapshot, and after-state snapshot including `reasonForCorrection`.

---

## 4. Endpoint Specifications

### 4.1 List Quality Inspections

```http
GET /api/v1/quality/inspections?page=1&limit=20&stage=FINAL&status=COMPLETED&result=PASS&search=BATCH-2026
```

#### Query Parameters

| Parameter     | Type     | Required | Description                                                    |
| :------------ | :------- | :------: | :------------------------------------------------------------- |
| `page`        | `number` |    No    | Page number (default: 1)                                       |
| `limit`       | `number` |    No    | Page limit (default: 20, max: 100)                             |
| `batchId`     | `string` |    No    | Filter by production batch UUID                                |
| `stage`       | `string` |    No    | `RECEIVING`, `FIRST_ARTICLE`, `IN_PROCESS`, `FINAL`            |
| `status`      | `string` |    No    | `IN_PROGRESS`, `COMPLETED`, `CANCELLED`                        |
| `result`      | `string` |    No    | `PASS`, `FAIL`, `CONDITIONAL`                                  |
| `inspectorId` | `string` |    No    | Filter by inspector user UUID                                  |
| `search`      | `string` |    No    | Case-insensitive search on inspection #, batch #, product code |
| `startDate`   | `string` |    No    | ISO timestamp lower bound on `inspected_at`                    |
| `endDate`     | `string` |    No    | ISO timestamp upper bound on `inspected_at`                    |

#### Response `200 OK`

```json
{
  "items": [
    {
      "id": "77777777-7777-7777-7777-777777777777",
      "inspectionNumber": "INSP-20261025-0001",
      "batchId": "b1111111-1111-1111-1111-111111111111",
      "inspectorId": "44444444-4444-4444-4444-444444444444",
      "stage": "FINAL",
      "attemptNumber": 1,
      "status": "COMPLETED",
      "result": "PASS",
      "sampleSize": 10,
      "passedUnits": 10,
      "failedUnits": 0,
      "inspectedAt": "2026-10-25T10:00:00.000Z",
      "notes": "Verified surface tolerance and runout specs",
      "createdAt": "2026-10-25T10:00:00.000Z",
      "updatedAt": "2026-10-25T10:00:00.000Z",
      "batchNumber": "BATCH-2026-100",
      "productCode": "PRD-001",
      "productName": "Precision Gearbox",
      "inspectorUsername": "insp_user",
      "inspectorFullName": "QA Inspector"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

### 4.2 Get Quality Inspection Details

```http
GET /api/v1/quality/inspections/:id
```

#### Response `200 OK`

```json
{
  "item": {
    "id": "77777777-7777-7777-7777-777777777777",
    "inspectionNumber": "INSP-20261025-0001",
    "batchId": "b1111111-1111-1111-1111-111111111111",
    "inspectorId": "44444444-4444-4444-4444-444444444444",
    "stage": "FINAL",
    "attemptNumber": 1,
    "status": "COMPLETED",
    "result": "PASS",
    "sampleSize": 10,
    "passedUnits": 10,
    "failedUnits": 0,
    "inspectedAt": "2026-10-25T10:00:00.000Z",
    "notes": "Verified surface tolerance and runout specs",
    "createdAt": "2026-10-25T10:00:00.000Z",
    "updatedAt": "2026-10-25T10:00:00.000Z",
    "batchNumber": "BATCH-2026-100",
    "productCode": "PRD-001",
    "productName": "Precision Gearbox",
    "inspectorUsername": "insp_user",
    "inspectorFullName": "QA Inspector"
  }
}
```

---

### 4.3 Record Quality Inspection

```http
POST /api/v1/quality/inspections
```

#### Request Body

```json
{
  "batchId": "b1111111-1111-1111-1111-111111111111",
  "stage": "FINAL",
  "attemptNumber": 1,
  "status": "COMPLETED",
  "sampleSize": 10,
  "passedUnits": 10,
  "failedUnits": 0,
  "notes": "Sample passed 100% optical inspection"
}
```

#### Response `201 Created`

```json
{
  "item": {
    "id": "77777777-7777-7777-7777-777777777777",
    "inspectionNumber": "INSP-20261025-0001",
    "batchId": "b1111111-1111-1111-1111-111111111111",
    "inspectorId": "44444444-4444-4444-4444-444444444444",
    "stage": "FINAL",
    "attemptNumber": 1,
    "status": "COMPLETED",
    "result": "PASS",
    "sampleSize": 10,
    "passedUnits": 10,
    "failedUnits": 0,
    "inspectedAt": "2026-10-25T10:00:00.000Z",
    "notes": "Sample passed 100% optical inspection",
    "createdAt": "2026-10-25T10:00:00.000Z",
    "updatedAt": "2026-10-25T10:00:00.000Z",
    "batchNumber": "BATCH-2026-100",
    "productCode": "PRD-001",
    "productName": "Precision Gearbox",
    "inspectorUsername": "insp_user",
    "inspectorFullName": "QA Inspector"
  }
}
```

---

### 4.4 Authorized Inspection Correction

```http
PATCH /api/v1/quality/inspections/:id
```

_Restricted to `ADMIN` and `QUALITY_MANAGER`._

#### Request Body

```json
{
  "notes": "Updated notes following optical recalibration",
  "reasonForCorrection": "Optical micrometer re-verification check confirmed 0 false defects"
}
```

#### Response `200 OK`

```json
{
  "item": {
    "id": "77777777-7777-7777-7777-777777777777",
    "inspectionNumber": "INSP-20261025-0001",
    "batchId": "b1111111-1111-1111-1111-111111111111",
    "inspectorId": "44444444-4444-4444-4444-444444444444",
    "stage": "FINAL",
    "attemptNumber": 1,
    "status": "COMPLETED",
    "result": "PASS",
    "sampleSize": 10,
    "passedUnits": 10,
    "failedUnits": 0,
    "inspectedAt": "2026-10-25T10:00:00.000Z",
    "notes": "Updated notes following optical recalibration",
    "createdAt": "2026-10-25T10:00:00.000Z",
    "updatedAt": "2026-10-25T10:15:00.000Z",
    "batchNumber": "BATCH-2026-100",
    "productCode": "PRD-001",
    "productName": "Precision Gearbox",
    "inspectorUsername": "insp_user",
    "inspectorFullName": "QA Inspector"
  }
}
```
