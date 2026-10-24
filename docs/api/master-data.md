# QualityOps API Reference â€” Master Data Management

This document defines the HTTP REST API contracts, authorization model, error specifications, and audit behaviors for Master Data Management implemented in Phase 4.

Base Route: `/api/v1/master-data`

---

## 1. Authentication & Role-Based Access Control (RBAC)

All endpoints under `/api/v1/master-data` require authentication via a JWT Bearer access token:

```http
Authorization: Bearer <accessToken>
```

### Authorization Matrix

| Action / Operation    | Method   | Route Pattern | Authorized Roles                                                            | Unauthorized / Forbidden Code        |
| :-------------------- | :------- | :------------ | :-------------------------------------------------------------------------- | :----------------------------------- |
| **List Entities**     | `GET`    | `/*`          | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER` | `401 Unauthorized` / `403 Forbidden` |
| **Get Entity Detail** | `GET`    | `/*/:id`      | `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER` | `401 Unauthorized` / `403 Forbidden` |
| **Create Entity**     | `POST`   | `/*`          | `ADMIN`, `QUALITY_MANAGER`                                                  | `401 Unauthorized` / `403 Forbidden` |
| **Update Entity**     | `PATCH`  | `/*/:id`      | `ADMIN`, `QUALITY_MANAGER`                                                  | `401 Unauthorized` / `403 Forbidden` |
| **Delete Entity**     | `DELETE` | `/*/:id`      | `ADMIN`, `QUALITY_MANAGER`                                                  | `401 Unauthorized` / `403 Forbidden` |

Attempts by `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, or `VIEWER` to perform mutations (`POST`, `PATCH`, `DELETE`) return `403 Forbidden`. Requests without valid bearer credentials return `401 Unauthorized`.

---

## 2. Common Query Parameters & Envelope

### Pagination and Filters (All Entities)

| Parameter  | Type                     | Default     | Description                                                   |
| :--------- | :----------------------- | :---------- | :------------------------------------------------------------ |
| `page`     | Integer â‰¥ 1            | `1`         | 1-indexed page number                                         |
| `limit`    | Integer â‰¥ 1, â‰¤ 100   | `20`        | Maximum items to return per page                              |
| `search`   | String                   | `undefined` | Case-insensitive substring match against `code` and `name`    |
| `isActive` | Boolean (`true`/`false`) | `undefined` | Filters by active operational status; if omitted, returns all |

### Common List Response Structure

```json
{
  "items": [/* array of entity objects */],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

---

## 3. Products Endpoints (`/api/v1/master-data/products`)

### `GET /api/v1/master-data/products`

Lists products with pagination and search.

### `GET /api/v1/master-data/products/:id`

Returns a single product by UUID.

### `POST /api/v1/master-data/products`

Creates a new product.

**Request Body:**

```json
{
  "code": "PRD-PUMP-001",
  "name": "Hydraulic Pump Assembly",
  "description": "High-pressure dual vane pump",
  "targetCycleTimeSeconds": 45.5,
  "isActive": true
}
```

**Constraints:**

- `code`: 1 to 50 characters, unique across all products.
- `name`: 1 to 150 characters.
- `targetCycleTimeSeconds`: Optional positive number (`> 0`).

**Response (201 Created):**

```json
{
  "item": {
    "id": "a0000000-0000-0000-0000-000000000001",
    "code": "PRD-PUMP-001",
    "name": "Hydraulic Pump Assembly",
    "description": "High-pressure dual vane pump",
    "targetCycleTimeSeconds": 45.5,
    "isActive": true,
    "createdAt": "2026-10-24T10:00:00.000Z",
    "updatedAt": "2026-10-24T10:00:00.000Z"
  }
}
```

### `PATCH /api/v1/master-data/products/:id`

Partially updates an existing product. Supports soft-deactivation via `{ "isActive": false }`.

### `DELETE /api/v1/master-data/products/:id`

Hard-deletes a product if unreferenced. If referenced by historical `production_batches` records, returns `409 Conflict` advising soft-deactivation instead.

---

## 4. Production Lines Endpoints (`/api/v1/master-data/production-lines`)

### `GET /api/v1/master-data/production-lines`

Lists production lines with pagination and search.

### `POST /api/v1/master-data/production-lines`

Creates a new production line.

**Request Body:**

```json
{
  "code": "LINE-ASSY-01",
  "name": "Final Assembly Line 1",
  "location": "Building B, Section 2",
  "isActive": true
}
```

---

## 5. Machines Endpoints (`/api/v1/master-data/machines`)

### `GET /api/v1/master-data/machines`

Lists machines with pagination, line filter, and machine status filter.

**Additional Query Parameters:**

- `productionLineId`: Filter machines belonging to a specific line UUID.
- `status`: Filter by operational status (`IDLE`, `RUNNING`, `DOWN`, `MAINTENANCE`).

### `POST /api/v1/master-data/machines`

Creates a machine linked to a production line.

**Request Body:**

```json
{
  "code": "MCH-CNC-001",
  "name": "5-Axis CNC Milling Center 1",
  "productionLineId": "b0000000-0000-0000-0000-000000000001",
  "status": "IDLE",
  "isActive": true
}
```

---

## 6. Shifts Endpoints (`/api/v1/master-data/shifts`)

### `GET /api/v1/master-data/shifts`

Lists shifts ordered by start time.

### `POST /api/v1/master-data/shifts`

Creates a shift. Supports 24-hour time clock, including overnight spans (e.g., `22:00` to `06:00`).

**Request Body:**

```json
{
  "code": "SHF-NIGHT",
  "name": "Third / Night Shift",
  "startTime": "22:00",
  "endTime": "06:00",
  "isActive": true
}
```

---

## 7. Defect Types Endpoints (`/api/v1/master-data/defect-types`)

### `GET /api/v1/master-data/defect-types`

Lists defect classifications with category and severity filters.

**Additional Query Parameters:**

- `category`: Substring match on defect category.
- `severity`: Filter by severity enum (`MINOR`, `MAJOR`, `CRITICAL`).

### `POST /api/v1/master-data/defect-types`

Creates a defect type.

**Request Body:**

```json
{
  "code": "DEF-CRACK-01",
  "name": "Structural Fatigue Crack",
  "category": "MECHANICAL",
  "severity": "CRITICAL",
  "isActive": true
}
```

---

## 8. Audit Logging & Integrity

All successful mutations (`CREATE`, `UPDATE`, `DEACTIVATE`, `DELETE`) write an immutable row to `audit_logs`:

- `actor_id`: UUID of the authenticated caller (`req.user.id`).
- `action`: `'CREATE'` | `'UPDATE'` | `'DEACTIVATE'` | `'DELETE'`.
- `entity_type`: `'PRODUCT'` | `'PRODUCTION_LINE'` | `'MACHINE'` | `'SHIFT'` | `'DEFECT_TYPE'`.
- `entity_id`: UUID of the entity.
- `request_id`: Tracing ID from `req.id`.
- `before_state`: Snapshot of previous attributes (for update/delete/deactivate).
- `after_state`: Snapshot of resulting attributes (for create/update).
- `ip_address`: Client IP address.

**Integrity Guarantee:** Failed requests (validation errors, 401, 403, duplicate code 409, FK constraint 409) do **not** write audit entries, preventing false audit pollution.
