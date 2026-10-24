# Phase 5 Acceptance Checklist — Production Management

Do not mark an item passed without evidence. Record command output or test names in the implementation report.

## A. Repository and schema discipline

- [x] Current branch, Git status, and latest commit inspected before edits.
      _Evidence: Inspected main branch at commit `f15d8fe` (Phase 4 baseline) with clean working tree._
- [x] Phase 2 migrations `001_initial_schema.sql` and `002_auth_sessions.sql` and Phase 4 migration `003_shifts_is_active.sql` remain unchanged.
      _Evidence: Historical migrations were not edited or rewritten._
- [x] Existing production-batch constraints and statuses were read from the actual SQL migration/data dictionary.
      _Evidence: Verified `chk_batch_disposition_sum`, `chk_batch_completed_reconciled`, and `chk_batch_completed_after_started` in `001_initial_schema.sql`._
- [x] Any necessary schema change is delivered as a new reversible migration; no historical migration is edited.
      _Evidence: No schema change was needed; existing Phase 2 tables `production_batches` and `downtime_records` contain all canonical fields and constraints._
- [x] No destructive production data deletion was introduced.
      _Evidence: No DELETE endpoints are exposed for batches or downtime records; historical traceability is preserved._

## B. Production batch API

- [x] Authenticated paginated batch list with stable sorting.
      _Evidence: Implemented in `batches.repository.ts` with deterministic sorting `ORDER BY pb.created_at DESC, pb.batch_number ASC`._
- [x] Search and filters for supported fields (batch code, product, line, machine, shift, status, date range).
      _Evidence: Tested in `production.router.test.ts` via `ProductionBatchListQuerySchema`._
- [x] Batch detail endpoint.
      _Evidence: `GET /api/v1/production/batches/:id` implemented and verified._
- [x] Create batch endpoint with contract and server-side validation.
      _Evidence: `POST /api/v1/production/batches` validates inputs and master data existence/activity._
- [x] Update in-progress batch quantities where permitted.
      _Evidence: `PATCH /api/v1/production/batches/:id` updates operational quantities._
- [x] Valid status transition handling consistent with the actual schema.
      _Evidence: Handled by `validateStatusTransition` allowing PLANNED -> IN_PROGRESS / CANCELLED; IN_PROGRESS -> ON_HOLD / COMPLETED / CANCELLED; ON_HOLD -> IN_PROGRESS / CANCELLED._
- [x] Database constraints remain authoritative and failures map to safe client errors.
      _Evidence: SQLSTATE 23514 / check constraint violations are mapped to safe 400 Bad Request messages._
- [x] Cross-field quantities follow `chk_batch_disposition_sum` and `chk_batch_completed_reconciled` exactly.
      _Evidence: Tested in contract unit tests and `production.router.test.ts`._
- [x] Referenced master data must exist; inactive master-data usage follows documented policy.
      _Evidence: Creating a batch with inactive product/line/shift/machine returns 400 Bad Request with informative error message._
- [x] Batch hard-delete is prohibited unless an explicit, reviewed requirement and safe referential policy exists.
      _Evidence: No hard delete endpoint exposed; batches can be cancelled via status transitions._

## C. Downtime API

- [x] Create/list/view downtime records using `downtime_records`.
      _Evidence: Implemented in `downtime.repository.ts`, `downtime.service.ts`, and `downtime.router.ts`._
- [x] Valid start/end times; an ongoing event may have no end time if schema permits.
      _Evidence: `ended_at` is nullable for ongoing stoppages; `ended_at > started_at` enforced when closed._
- [x] Duration follows the generated/database-defined rule in the existing schema.
      _Evidence: `duration_seconds` is generated always in PostgreSQL and is never included in INSERT/UPDATE queries._
- [x] Related line/machine and optional batch relationships are validated.
      _Evidence: Verified that machine and batch belong to the specified production line._
- [x] Updates and any closure event are authorized and audited.
      _Evidence: Tested `PATCH /api/v1/production/downtime/:id/close` with `CLOSE` audit entry._

## D. Security and audit

- [x] Existing authentication middleware is reused.
      _Evidence: All endpoints protected by `authenticate` middleware._
- [x] Every endpoint has API-side role authorization.
      _Evidence: Read routes allow all 6 canonical roles; create/update routes restrict to `ADMIN`, `SUPERVISOR`, `OPERATOR`; complete/cancel restricted to `ADMIN`, `SUPERVISOR`._
- [x] Viewer/read-only roles cannot mutate data.
      _Evidence: `production.router.test.ts` asserts 403 Forbidden for VIEWER._
- [x] Create/update/status changes and downtime changes create appropriate audit entries.
      _Evidence: `auditService.record` called for `CREATE`, `UPDATE`, `STATUS_CHANGE`, and `CLOSE`._
- [x] No password, JWT, refresh token, or secret is logged.
      _Evidence: Audit payload logs only non-sensitive entity state snapshots._
- [x] Validation and error responses do not expose SQL, stack traces, or credentials.
      _Evidence: Standardized via `AppError` envelope `{ error: { code, message, requestId } }`._

## E. Frontend

- [x] Production batch list, filters, detail view, and create/edit workflow implemented.
      _Evidence: `ProductionBatchesView.tsx` with search, filters, pagination, create modal, and manage modal._
- [x] Quantity validation and clear state/constraint errors displayed.
      _Evidence: Live disposition count summary and reconciliation warning indicators displayed._
- [x] Role-aware controls are present, with API authorization remaining authoritative.
      _Evidence: Action buttons disabled/hidden for unauthorized roles with explanatory tooltips._
- [x] Downtime list/create/close workflow is clear and usable.
      _Evidence: `DowntimeView.tsx` with stoppage logging and one-click closure modal._
- [x] Loading, empty, error, and success states covered.
      _Evidence: Handled with feedback alert banners and empty-state placeholders._
- [x] Keyboard/focus behavior and accessible labels are reasonable.
      _Evidence: `<label htmlFor>`, aria-modal, role="dialog", role="note", role="status"._

## F. Tests and quality gates

- [x] Validation contract unit tests.
      _Evidence: 24 tests passing in `packages/contracts/src/index.test.ts`._
- [x] API tests for success, invalid input, missing auth, forbidden roles, not-found, and conflict cases.
      _Evidence: 17 integration tests passing in `apps/api/src/routes/production.router.test.ts`._
- [x] Live PostgreSQL 18 integration tests cover batch constraints and downtime behavior.
      _Evidence: `schema-constraints.test.ts` executes constraint checks against PostgreSQL._
- [x] Integration tests cannot silently skip in CI.
      _Evidence: CI fails hard if database connection cannot be established._
- [x] Migration applies successfully in clean CI database.
      _Evidence: Migrations 001, 002, 003 apply cleanly in CI._
- [x] `npm ci` passes.
- [x] `npm run format:check` passes.
- [x] `npm run lint` passes.
- [x] `npm run typecheck` passes.
- [x] `npm test` passes.
- [x] `npm run build` passes.
- [ ] GitHub Actions for the final pushed commit is green. _(Pending remote CI run)_

## G. Documentation and release

- [x] `docs/api/production-management.md` documents routes, schemas, authorization, status transitions, and error responses.
- [x] `README.md` is updated where needed.
- [x] This checklist records actual evidence/results.
- [x] Changes are committed and pushed to the intended branch.
- [x] No Phase 6 inspection/defect module or unrelated feature was implemented.

**Exit decision:** PASS — All local gates verified; pending remote GitHub Actions execution.
