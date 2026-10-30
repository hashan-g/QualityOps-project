# QualityOps — Notifications & Email Delivery API Specification

**Phase:** Phase 12: Notification Engine, Configured Email Delivery & Operational Dispatch  
**Status:** Implemented & Verified Baseline  
**Date:** October 2026  
**Audience:** Backend Engineers, Frontend Engineers, QA, System Administrators

---

## 1. Overview & Architectural Principles

Phase 12 introduces a robust multi-channel notification engine and asynchronous email delivery infrastructure for QualityOps. The architecture strictly isolates in-app user read states from outbound email transmission states.

### Core Architectural Decisions:

1. **Decoupled Persistence Model:**
   - `notifications`: User-scoped in-app notifications. Read state is represented by `read_at TIMESTAMPTZ` (NULL = unread).
   - `email_deliveries`: Durable outbound email delivery queue and ledger. Status progresses through `PENDING -> SENDING -> SENT` or `FAILED`.
   - Never conflate read status with transmission status.
2. **Strict Channel Restriction:**
   - Supported channels are strictly `IN_APP` and `EMAIL`.
   - No SMS, Twilio, or Webhook channels are exposed until real transport providers exist.
3. **Asynchronous Non-Blocking Dispatch:**
   - Database transactions for scheduled report generation and alert evaluations never perform network operations.
   - Delivery intents are persisted atomically in `email_deliveries` and processed asynchronously by the delivery worker (`npm run notifications:deliver`).
4. **Idempotency & Deduplication:**
   - In-app notifications enforce unique `idempotency_key` (e.g. `alert-inapp:${alert.id}:${userId}`).
   - Outbound email deliveries enforce unique `idempotency_key` (e.g. `report-run-email:${run.id}:${recipientEmail}`).
5. **Worker Concurrency & Reliability:**
   - Background worker utilizes PostgreSQL `FOR UPDATE SKIP LOCKED` on `email_deliveries`.
   - Transient failures trigger exponential backoff: $t_{\text{next}} = \text{now} + 2^{\text{attempt}-1} \times 60\,\text{s}$.
   - Terminal failure is recorded after exceeding `max_attempts` (default: 3).
6. **Transport Hardening & Safety:**
   - Deterministic `MockEmailTransport` for tests and explicit local development.
   - `SmtpEmailTransport` utilizing `nodemailer` with bounded connection timeouts (default: 10,000 ms) and TLS validation.
   - Production validation strictly rejects `EMAIL_MOCK_DELIVERY=true` or localhost SMTP coordinates.
   - Secret redaction sanitizes all credentials (`SMTP_PASS`, `smtp_password`) from logs and persisted `last_error` traces.

---

## 2. Shared Contracts & Data Schemas

All schemas are formalized in `@qualityops/contracts` and enforced via Zod.

### 2.1 Enums

```typescript
export const NotificationSeveritySchema = z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type NotificationSeverity = z.infer<typeof NotificationSeveritySchema>;

export const NotificationChannelSchema = z.enum(['IN_APP', 'EMAIL']);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const NotificationEntityTypeSchema = z.enum([
  'OPERATIONAL_ALERT',
  'REPORT_RUN',
  'SCHEDULED_REPORT',
  'CAPA_CASE',
  'QUALITY_INSPECTION',
]);
export type NotificationEntityType = z.infer<typeof NotificationEntityTypeSchema>;

export const EmailDeliveryStatusSchema = z.enum(['PENDING', 'SENDING', 'SENT', 'FAILED']);
export type EmailDeliveryStatus = z.infer<typeof EmailDeliveryStatusSchema>;
```

### 2.2 Response Payloads

#### `NotificationResponse`

```typescript
{
  id: string; // UUID
  userId: string; // UUID of recipient
  title: string; // max 200 chars
  message: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  channel: 'IN_APP' | 'EMAIL';
  entityType?: 'OPERATIONAL_ALERT' | 'REPORT_RUN' | 'SCHEDULED_REPORT' | 'CAPA_CASE' | 'QUALITY_INSPECTION' | null;
  entityId?: string | null;
  metadata: Record<string, unknown>;
  readAt?: string | null; // ISO-8601 timestamp; null = unread
  idempotencyKey?: string | null;
  createdAt: string; // ISO-8601 timestamp
  updatedAt: string; // ISO-8601 timestamp
}
```

#### `NotificationListResponse`

```typescript
{
  items: NotificationResponse[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}
```

#### `EmailDeliveryResponse`

```typescript
{
  id: string; // UUID
  notificationId?: string | null;
  recipientEmail: string;
  recipientUserId?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string; // ISO-8601
  sentAt?: string | null;
  lastError?: string | null; // Sanitized error string
  artifactId?: string | null; // UUID
  reportRunId?: string | null; // UUID
  idempotencyKey?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## 3. API Endpoints

Base Path: `/api/v1/notifications`  
All endpoints require a valid JWT Access Token in the `Authorization: Bearer <token>` header.

### 3.1 List User Notifications

- **Method / Route:** `GET /api/v1/notifications`
- **Authorization:** Authenticated user (operates strictly on `req.user.id`).
- **Query Parameters:**
  - `unreadOnly` (boolean, optional, default: `false`): When `true`, filters items where `read_at IS NULL`.
  - `page` (number, optional, default: `1`): Page number.
  - `limit` (number, optional, default: `20`, max: `100`): Items per page.
- **Success Response (`200 OK`):**

```json
{
  "items": [
    {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "userId": "c56a4180-65aa-42ec-a945-5fd21dec0538",
      "title": "Operational Alert: High Inspection Failure Rate",
      "message": "Inspection failure rate on Line 1 exceeded threshold (15.2% vs 5.0% limit).",
      "severity": "HIGH",
      "channel": "IN_APP",
      "entityType": "OPERATIONAL_ALERT",
      "entityId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "metadata": {
        "ruleType": "HIGH_INSPECTION_FAILURE_RATE"
      },
      "readAt": null,
      "idempotencyKey": "alert-inapp:a1b2c3d4-e5f6-7890-abcd-ef1234567890:c56a4180-65aa-42ec-a945-5fd21dec0538",
      "createdAt": "2026-10-30T01:00:00.000Z",
      "updatedAt": "2026-10-30T01:00:00.000Z"
    }
  ],
  "total": 1,
  "unreadCount": 1,
  "page": 1,
  "limit": 20
}
```

### 3.2 Mark Single Notification as Read

- **Method / Route:** `PATCH /api/v1/notifications/:id/read`
- **Authorization:** Authenticated user.
- **Ownership Invariant:** The notification MUST belong to `req.user.id`. If another user attempts to mark it read, the API returns `404 Not Found` (preventing IDOR information leakage).
- **Success Response (`200 OK`):**

```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "userId": "c56a4180-65aa-42ec-a945-5fd21dec0538",
  "title": "Operational Alert: High Inspection Failure Rate",
  "message": "Inspection failure rate on Line 1 exceeded threshold.",
  "severity": "HIGH",
  "channel": "IN_APP",
  "entityType": "OPERATIONAL_ALERT",
  "entityId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "metadata": {},
  "readAt": "2026-10-30T01:05:00.000Z",
  "idempotencyKey": "alert-inapp:a1b2c3d4-e5f6-7890-abcd-ef1234567890:c56a4180-65aa-42ec-a945-5fd21dec0538",
  "createdAt": "2026-10-30T01:00:00.000Z",
  "updatedAt": "2026-10-30T01:05:00.000Z"
}
```

### 3.3 Mark All Notifications as Read

- **Method / Route:** `POST /api/v1/notifications/mark-all-read`
- **Authorization:** Authenticated user. Marks all unread in-app notifications belonging to `req.user.id` as read at current timestamp.
- **Success Response (`200 OK`):**

```json
{
  "updatedCount": 5
}
```

---

## 4. Operational Dispatch Workflows

### 4.1 Scheduled Report Dispatch

1. When `executeSingleSchedule` runs due recurring reports, it persists the report run and generates the export artifact (CSV, XLSX, or PDF) in the secure artifact directory.
2. If the schedule has configured `recipients` (e.g. `["quality-lead@plant.local", "ops-director@plant.local"]`):
   - An `email_deliveries` record is created for each recipient.
   - Attachment metadata is linked (`artifactId`).
   - The worker verifies artifact existence and bounds attachment size (`EMAIL_MAX_ATTACHMENT_SIZE_BYTES`, default: 10 MB).
   - Delivery failures do NOT invalidate the report run or generate false successes.

### 4.2 Operational Alert Dispatch

1. When `alerts.evaluator.ts` records newly triggered alerts:
   - For `HIGH` and `CRITICAL` alerts, active users possessing canonical management roles (`ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`) are queried.
   - For each eligible user:
     - An in-app notification is queued with idempotency key `alert-inapp:${alert.id}:${user.id}`.
     - An outbound email delivery is queued with idempotency key `alert-email:${alert.id}:${user.email}`.
   - Repeated rule evaluation within cooldown period avoids duplicate notifications via unique partial-index constraints.

---

## 5. Background Delivery Worker

The delivery worker runs as a dedicated CLI process:

```bash
npm run notifications:deliver
```

Configured in `package.json`:
`"notifications:deliver": "npm run notifications:deliver -w @qualityops/api"` -> `tsx src/scripts/process-email-deliveries.ts`.

Batching options:

- Default batch size: 25 deliveries per run.
- Idempotent lock: `SELECT ... FOR UPDATE SKIP LOCKED`.
- Status transitions: `PENDING -> SENDING -> SENT` (with `sent_at`) or `FAILED` (with sanitized `last_error` and updated `next_attempt_at`).
