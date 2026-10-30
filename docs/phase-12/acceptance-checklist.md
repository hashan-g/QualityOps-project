# Phase 12 Acceptance Checklist — Notification Engine, Configured Email Delivery & Operational Dispatch

Mark an item complete only when concrete evidence (test output, file path, code verification, or CI result) exists.

---

## 1. Repository & Baseline Integrity

- [x] Inspected current `main`, baseline commit (`6e5455a`), migrations 001–005, security hardening (SEC-001–SEC-022), and React web application before changes.
- [x] Baseline migrations 001–005 preserved intact without edits.
- [x] New reversible migration `006_notifications.sql` created in `database/migrations` with corresponding down migration statements.
- [x] No secrets or real credentials added to tracked files; `.env.example` updated with placeholders only.

---

## 2. Database Design & Migration 006

- [x] Dedicated `notifications` table created for in-app user notifications with `user_id`, `title`, `message`, `severity`, `channel`, `entity_type`, `entity_id`, `metadata`, `read_at`, and `idempotency_key`.
- [x] Dedicated `email_deliveries` table created for durable email delivery tracking with `recipient_email`, `recipient_user_id`, `subject`, `body_text`, `body_html`, `status`, `attempt_count`, `max_attempts`, `next_attempt_at`, `sent_at`, `last_error`, `artifact_id`, `report_run_id`, and `idempotency_key`.
- [x] Separate read state (`read_at` on `notifications`) from outbound delivery state (`status` on `email_deliveries`).
- [x] Channels strictly restricted to `IN_APP` and `EMAIL` via SQL check constraints and contract schemas; no SMS or webhook channels exposed.
- [x] Backward-compatible `recipients JSONB DEFAULT '[]'::jsonb` column added to `scheduled_reports`.
- [x] Migration rollback (`-- Down Migration`) cleanly drops tables with cascades and removes `recipients` column.
- [x] Static and live migration constraints covered in `apps/api/src/infrastructure/database/schema-constraints.test.ts`.

---

## 3. Email Transport & Configuration Validation

- [x] Email transport abstraction defined with `IEmailTransport`, `SendEmailOptions`, `EmailSendResult`, and `EmailAttachment` (`email-transport.interface.ts`).
- [x] Deterministic `MockEmailTransport` implemented for automated tests and explicit local development (`mock-email.transport.ts`).
- [x] Production SMTP transport implemented with `nodemailer` (`smtp-email.transport.ts`) with bounded timeouts (default: 10,000 ms) and TLS validation.
- [x] Email delivery disabled by default (`EMAIL_ENABLED=false`). When disabled, delivery calls throw `EmailDeliveryDisabledError` and do not simulate fake delivery.
- [x] Strict production validation in `apps/api/src/config.ts`:
  - When `NODE_ENV=production` and `EMAIL_ENABLED=true`, required SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`) must be provided and valid.
  - Production strictly rejects `EMAIL_MOCK_DELIVERY=true`.
  - Production strictly rejects localhost SMTP servers (`127.0.0.1`, `localhost`, `::1`).
- [x] Secret redaction: SMTP credentials (`smtp_pass`, `pass`, `smtp_password`) are added to `sensitiveKeys` in `redact.service.ts` and masked in logs and persisted error records.
- [x] 21/21 configuration unit tests pass in `apps/api/src/config.test.ts`.

---

## 4. Asynchronous Delivery Worker & Operational Dispatch

- [x] Network delivery is strictly decoupled from report generation and alert evaluation database transactions.
- [x] Delivery intent is persisted in `email_deliveries` before external dispatch.
- [x] Delivery worker implemented in `apps/api/src/scripts/process-email-deliveries.ts` and callable via `npm run notifications:deliver`.
- [x] Safe concurrency control: worker uses PostgreSQL `FOR UPDATE SKIP LOCKED` to prevent duplicate delivery attempts under concurrent execution.
- [x] Transient failures trigger exponential backoff: $t_{\text{next}} = \text{now} + 2^{\text{attempt}-1} \times 60\,\text{s}$.
- [x] Terminal failure recorded after exceeding `max_attempts` (default: 3) with sanitized `last_error`.
- [x] Scheduled Reports integration:
  - Generates email delivery records for configured `recipients` on successful report run.
  - Attachment handling validates file existence and bounds size against `EMAIL_MAX_ATTACHMENT_SIZE_BYTES` (default: 10 MB).
  - Delivery failure does not invalidate the report run or generate false report-run successes.
- [x] Operational Alerts integration:
  - Newly triggered `HIGH` and `CRITICAL` alerts dispatch in-app notifications and email delivery intents.
  - Recipients are restricted to active users with canonical management roles: `ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`.
  - Duplicate notifications prevented via unique idempotency keys (`alert-inapp:${alert.id}:${userId}` and `alert-email:${alert.id}:${recipientEmail}`).
- [x] 11/11 service and dispatch unit tests pass in `apps/api/src/modules/notifications/notifications.service.test.ts`.

---

## 5. Notifications REST API

- [x] `GET /api/v1/notifications` implemented:
  - Lists current authenticated user's notifications.
  - Supports `unreadOnly` filter and pagination (`page`, `limit`).
  - Returns `unreadCount` for immediate UI badging.
- [x] `PATCH /api/v1/notifications/:id/read` implemented:
  - Marks single notification as read with `read_at` timestamp.
  - Enforces strict user ownership; returns `404 Not Found` for IDOR attempts on another user's notifications.
- [x] `POST /api/v1/notifications/mark-all-read` implemented:
  - Marks all unread notifications for current user as read in a single atomic update.
  - Returns `{ updatedCount }`.
- [x] Standard error envelopes (`ErrorEnvelopeSchema`) and request-ID propagation preserved.
- [x] 10/10 integration tests pass in `apps/api/src/routes/notifications.router.test.ts`.

---

## 6. Authenticated Web Application & Notification Center

- [x] Notification bell icon with real-time unread badge integrated in `AuthenticatedView.tsx` header.
- [x] Notification Center modal dialog (`NotificationCenter.tsx`) implemented with:
  - List of recent notifications with clear read and unread visual styles.
  - Filter toggle for "All" vs "Unread".
  - "Mark as read" button per item and "Mark all as read" batch action.
  - Contextual entity navigation to Alerts (`/alerts`), Reports (`/reports`), and CAPA (`/capa`) when valid references exist.
  - Graceful empty, loading, and error states.
- [x] Recipient configuration added to Reports Schedule Modal (`ReportsView.tsx`) with comma-separated email input.
- [x] Application header phase badge updated to `Phase 12: Notification Engine & Email Delivery` in `App.tsx`.
- [x] 12/12 web component tests pass in `apps/web/src/App.test.tsx`.

---

## 7. Verification & Quality Gates

- [x] `npm run format:check` passes with zero formatting issues.
- [x] `npm run lint` passes with zero ESLint errors or warnings.
- [x] `npm run typecheck` passes with zero TypeScript errors across all workspaces (`@qualityops/contracts`, `@qualityops/api`, `@qualityops/web`).
- [x] `npm test` passes across all test suites (**406 total passing tests**):
  - `services/analytics`: 14 passed (Pytest)
  - `@qualityops/contracts`: 68 passed (Vitest)
  - `@qualityops/api`: 312 passed (Vitest across 21 test suites)
  - `@qualityops/web`: 12 passed (Vitest)
- [x] `npm run build` succeeds for all production targets (`dist/` bundles generated).
- [ ] Push to GitHub and verify GitHub Actions CI quality gate passes.

---

## 8. Explicit Phase Boundaries & Out-of-Scope Items

- [x] **No SMS / Twilio:** Telephony messaging is out of scope for Phase 12.
- [x] **No Webhook Channels:** Outbound webhooks remain deferred until dedicated webhook delivery transport and HMAC signature infrastructure are implemented in a future phase.
- [x] **No Variable SPC Control Charts:** Variable control charts ($\bar{X}-R, \bar{X}-s$) remain deferred to Phase 13.
- [x] **No Cloud / Kubernetes Infrastructure:** Deployment manifests remain deferred to Phase 14.
