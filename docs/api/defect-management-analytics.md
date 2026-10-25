# QualityOps API Reference — Defect Management & Descriptive Analytics (Phase 7)

This document defines the HTTP REST API contracts, role-based access control (RBAC), defect count semantics, database constraints, and descriptive analytics specifications for the Defect Management & Analytics module (Phase 7).

Base Route: `/api/v1/quality/defects`

---

## 1. Authentication & Role-Based Access Control (RBAC)

All endpoints under `/api/v1/quality/defects` require an authenticated session via a JWT Bearer token:

```http
Authorization: Bearer <accessToken>
```

### Authorization Matrix

| Endpoint                            |  Method  | Permitted Roles                                                             | Description                                                      |
| :---------------------------------- | :------: | :-------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| `/api/v1/quality/defects/analytics` |  `GET`   | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER` | Retrieve bounded descriptive analytics & Pareto distributions    |
| `/api/v1/quality/defects`           |  `GET`   | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER` | List defect findings with pagination, search, and filters        |
| `/api/v1/quality/defects/:id`       |  `GET`   | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER` | Retrieve detailed defect finding by ID with joined context       |
| `/api/v1/quality/defects`           |  `POST`  | `ADMIN`, `QUALITY_MANAGER`, `INSPECTOR`                                     | Record a new defect finding against an active quality inspection |
| `/api/v1/quality/defects/:id`       | `PATCH`  | `ADMIN`, `QUALITY_MANAGER`                                                  | Controlled correction of defect counts with required reason      |
| `/api/v1/quality/defects/:id`       | `DELETE` | _None_                                                                      | **FORBIDDEN**: Historical defect records cannot be deleted       |

- **Unauthenticated requests** return `401 Unauthorized`.
- **Unauthorized roles** return `403 Forbidden`.
- **Actor Identity**: Derived automatically from the authenticated session (`req.user.id`). Never trusted from client body input.
- **Strict Non-Destructive Invariant**: Submitted defect records are immutable and non-destructive. No `DELETE` endpoint is exposed (returns `404 Not Found`).

---

## 2. Measurement Semantics & Counting Invariants

### Cardinal Distinctions

- **Defect Record Row Count**: Total number of defect finding records stored.
- **Occurrence Count (`occurrence_count`)**: Total defect instances detected across sampled units. A single unit may have multiple occurrences of the same defect type.
- **Affected-Unit Count (`affected_unit_count`)**: Number of inspected units exhibiting that specific defect finding.
- **Inspection Sample Size & Failed Units**: Discrete quality gate metrics evaluated during the inspection.
- **Production Batch Disposition Quantities**: Physical batch disposition (`accepted_quantity`, `scrap_quantity`, `rework_pending_quantity`).
- **Isolation Invariant**: Defect record mutations **NEVER** alter or mutate production batch disposition quantities.

### Database Constraints & Invariants

1. **Affected Units Bound (`chk_defect_affected_le_occurrence`)**:
   $$\text{affected\_unit\_count} \le \text{occurrence\_count}$$
   Every defect finding must satisfy that affected units do not exceed total defect occurrences.
2. **Positive Integer Invariant**:
   $$\text{occurrence\_count} \ge 1, \quad \text{affected\_unit\_count} \ge 1$$
3. **Inspection Sample Bound**:
   $$\text{affected\_unit\_count} \le \text{inspection.sample\_size}$$
   An affected-unit count cannot exceed the total sample units inspected.
4. **Completed Inspection Bound**:
   $$\text{inspection.status} = \text{'COMPLETED'} \implies \text{affected\_unit\_count} \le \text{inspection.failed\_units}$$
   Completed inspections with zero failed units (`result: 'PASS'`) reject new defect findings with `400 Bad Request`.
5. **Inspection Lifecycle Eligibility**:
   Defect findings cannot be created against `CANCELLED` inspections (returns `400 Bad Request`).
6. **Unique Defect Type per Inspection (`uq_defect_record_inspection_type`)**:
   UNIQUE (`inspection_id`, `defect_type_id`). Attempting to insert a duplicate defect type for the same inspection returns `409 Conflict`. Use the `PATCH` correction route to update counts.

---

## 3. Transactional Audit Logging

All defect finding creations and corrections participate in the same PostgreSQL transaction:

- **Creation**: Audits `action: 'CREATE'`, `entityType: 'DEFECT_RECORD'`, actor ID, entity ID, and state snapshot.
- **Correction**: Audits `action: 'CORRECTION'`, `entityType: 'DEFECT_RECORD'`, actor ID, entity ID, before-state snapshot, and after-state snapshot including `reasonForCorrection`.

---

## 4. Endpoint Specifications

### 4.1 Descriptive Analytics Aggregations

```http
GET /api/v1/quality/defects/analytics?severity=CRITICAL&trendInterval=WEEK
```

#### Query Parameters

| Parameter          | Type     | Required | Description                                                   |
| :----------------- | :------- | :------: | :------------------------------------------------------------ |
| `startDate`        | `string` |    No    | ISO timestamp lower bound on `qi.inspected_at`                |
| `endDate`          | `string` |    No    | ISO timestamp upper bound on `qi.inspected_at`                |
| `batchId`          | `string` |    No    | Filter by production batch UUID                               |
| `productId`        | `string` |    No    | Filter by product UUID                                        |
| `productionLineId` | `string` |    No    | Filter by production line UUID                                |
| `machineId`        | `string` |    No    | Filter by machine UUID                                        |
| `shiftId`          | `string` |    No    | Filter by shift UUID                                          |
| `defectTypeId`     | `string` |    No    | Filter by standardized defect type UUID                       |
| `severity`         | `string` |    No    | Filter by severity (`MINOR`, `MAJOR`, `CRITICAL`)             |
| `trendInterval`    | `string` |    No    | Trend aggregation period: `DAY` (default), `WEEK`, or `MONTH` |

#### Response `200 OK`

```json
{
  "overview": {
    "totalFindings": 12,
    "totalOccurrences": 35,
    "totalAffectedUnitsAcrossFindings": 24
  },
  "byType": [
    {
      "defectTypeId": "88888888-8888-8888-8888-888888888888",
      "code": "DEF-001",
      "name": "Surface Scratch",
      "category": "SURFACE",
      "severity": "MINOR",
      "findingCount": 6,
      "occurrenceCount": 18,
      "affectedUnitCount": 12
    }
  ],
  "bySeverity": [
    {
      "severity": "CRITICAL",
      "findingCount": 2,
      "occurrenceCount": 4,
      "affectedUnitCount": 3
    }
  ],
  "byProduct": [
    {
      "id": "p1111111-1111-1111-1111-111111111111",
      "code": "PRD-001",
      "name": "Precision Gearbox",
      "findingCount": 12,
      "occurrenceCount": 35,
      "affectedUnitCount": 24
    }
  ],
  "byProductionLine": [],
  "byMachine": [],
  "byShift": [],
  "trend": [
    {
      "period": "2026-10-26",
      "findingCount": 12,
      "occurrenceCount": 35,
      "affectedUnitCount": 24
    }
  ],
  "pareto": [
    {
      "defectTypeId": "88888888-8888-8888-8888-888888888888",
      "code": "DEF-001",
      "name": "Surface Scratch",
      "category": "SURFACE",
      "severity": "MINOR",
      "measure": "affectedUnitCount",
      "value": 12,
      "percentage": 50.0,
      "cumulativePercentage": 50.0
    }
  ]
}
```

---

### 4.2 List Defect Findings

```http
GET /api/v1/quality/defects?page=1&limit=20&severity=MAJOR&search=Gearbox
```

#### Response `200 OK`

```json
{
  "items": [
    {
      "id": "99999999-9999-9999-9999-999999999999",
      "inspectionId": "77777777-7777-7777-7777-777777777777",
      "defectTypeId": "88888888-8888-8888-8888-888888888888",
      "occurrenceCount": 3,
      "affectedUnitCount": 2,
      "notes": "Micro-scratches on flank surface",
      "createdAt": "2026-10-26T10:05:00.000Z",
      "updatedAt": "2026-10-26T10:05:00.000Z",
      "defectTypeCode": "DEF-001",
      "defectTypeName": "Surface Scratch",
      "defectTypeCategory": "SURFACE",
      "defectTypeSeverity": "MINOR",
      "inspectionNumber": "INSP-20261026-0001",
      "inspectionStage": "FINAL",
      "batchNumber": "BATCH-2026-100",
      "productCode": "PRD-001",
      "productName": "Precision Gearbox"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

### 4.3 Record Defect Finding

```http
POST /api/v1/quality/defects
```

#### Request Body

```json
{
  "inspectionId": "77777777-7777-7777-7777-777777777777",
  "defectTypeId": "88888888-8888-8888-8888-888888888888",
  "occurrenceCount": 3,
  "affectedUnitCount": 2,
  "notes": "Micro-scratches on flank surface"
}
```

#### Response `201 Created`

```json
{
  "item": {
    "id": "99999999-9999-9999-9999-999999999999",
    "inspectionId": "77777777-7777-7777-7777-777777777777",
    "defectTypeId": "88888888-8888-8888-8888-888888888888",
    "occurrenceCount": 3,
    "affectedUnitCount": 2,
    "notes": "Micro-scratches on flank surface",
    "createdAt": "2026-10-26T10:05:00.000Z",
    "updatedAt": "2026-10-26T10:05:00.000Z",
    "defectTypeCode": "DEF-001",
    "defectTypeName": "Surface Scratch",
    "defectTypeCategory": "SURFACE",
    "defectTypeSeverity": "MINOR",
    "inspectionNumber": "INSP-20261026-0001",
    "inspectionStage": "FINAL",
    "batchNumber": "BATCH-2026-100",
    "productCode": "PRD-001",
    "productName": "Precision Gearbox"
  }
}
```

---

### 4.4 Authorized Defect Correction

```http
PATCH /api/v1/quality/defects/:id
```

_Restricted to `ADMIN` and `QUALITY_MANAGER`._

#### Request Body

```json
{
  "occurrenceCount": 4,
  "affectedUnitCount": 2,
  "reasonForCorrection": "Recounted defect occurrences on sample unit #2 under magnification"
}
```

#### Response `200 OK`

```json
{
  "item": {
    "id": "99999999-9999-9999-9999-999999999999",
    "inspectionId": "77777777-7777-7777-7777-777777777777",
    "defectTypeId": "88888888-8888-8888-8888-888888888888",
    "occurrenceCount": 4,
    "affectedUnitCount": 2,
    "notes": "Micro-scratches on flank surface",
    "createdAt": "2026-10-26T10:05:00.000Z",
    "updatedAt": "2026-10-26T10:20:00.000Z",
    "defectTypeCode": "DEF-001",
    "defectTypeName": "Surface Scratch",
    "defectTypeCategory": "SURFACE",
    "defectTypeSeverity": "MINOR",
    "inspectionNumber": "INSP-20261026-0001",
    "inspectionStage": "FINAL",
    "batchNumber": "BATCH-2026-100",
    "productCode": "PRD-001",
    "productName": "Precision Gearbox"
  }
}
```
