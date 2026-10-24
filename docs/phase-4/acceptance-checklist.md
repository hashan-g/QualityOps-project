# QualityOps Phase 4 Acceptance Checklist â€” Master Data Management

Mark each item `PASS`, `FAIL`, or `PENDING` and attach evidence. Do not mark PASS based solely on source-code inspection if execution evidence is required.

## A. Scope and architecture

- [x] Existing Phase 1â€“3 architecture and authentication behavior preserved.
      _Evidence: All Phase 1, 2, and 3 tests pass without regressions (auth repository, token service, user admin, and schema constraints). Session rotation and HttpOnly cookies remain intact._
- [x] Only master-data features implemented; no production/inspection/CAPA/analytics workflows added.
      _Evidence: Routes scoped strictly to `/api/v1/master-data/*`. No production batches, inspection executions, or analytics endpoints created._
- [x] Existing applied migrations were not rewritten.
      _Evidence: `001_initial_schema.sql` and `002_auth_sessions.sql` are unchanged. Migration `003_shifts_is_active.sql` added with Up and Down clauses._

## B. API functionality

- [x] Products list/detail/create/update/deactivate works, according to schema.
      _Evidence: Implemented in `apps/api/src/modules/master-data/products/` and verified in `master-data.router.test.ts`._
- [x] Production lines list/detail/create/update/deactivate works, according to schema.
      _Evidence: Implemented in `apps/api/src/modules/master-data/production-lines/` and verified in `master-data.router.test.ts`._
- [x] Machines list/detail/create/update/deactivate works, according to schema.
      _Evidence: Implemented in `apps/api/src/modules/master-data/machines/` and verified in `master-data.router.test.ts` (FK verification, status enum)._
- [x] Shifts list/detail/create/update/deactivate works, according to schema.
      _Evidence: Implemented in `apps/api/src/modules/master-data/shifts/` and verified in `master-data.router.test.ts` (24h format, overnight support)._
- [x] Defect types list/detail/create/update/deactivate works, according to schema.
      _Evidence: Implemented in `apps/api/src/modules/master-data/defect-types/` and verified in `master-data.router.test.ts` (severity enum)._
- [x] Pagination/filter/search validation is bounded and correct.
      _Evidence: Schemas enforce positive integers for `page` and bounded `limit` (max 100), case-insensitive substring search, and boolean status filters._
- [x] Errors use the established API envelope and correct HTTP status codes.
      _Evidence: All errors processed via `AppError` producing `{ error: { code, message, requestId, details } }`._

## C. Authorization and integrity

- [x] Unauthenticated requests return 401.
      _Evidence: Verified across all master-data endpoints in `master-data.router.test.ts`._
- [x] ADMIN and QUALITY_MANAGER permissions match documented policy.
      _Evidence: Both roles permitted to execute POST, PATCH, and DELETE._
- [x] SUPERVISOR / INSPECTOR / OPERATOR / VIEWER cannot perform unauthorized writes.
      _Evidence: Tested in `master-data.router.test.ts`; returns 403 Forbidden on POST, PATCH, and DELETE._
- [x] Unique conflicts return 409.
      _Evidence: Duplicate code creation attempts return 409 Conflict across entities._
- [x] FK relationships and database constraints are enforced.
      _Evidence: Machine `productionLineId` verified against `production_lines`; cycle time positive check enforced._
- [x] Referenced history cannot be destroyed by master-data deletion.
      _Evidence: Foreign key violation `23503` caught on delete and converted to 409 Conflict with guidance to deactivate instead._
- [x] Successful mutations are audited; failed mutations do not create false audit entries.
      _Evidence: Tested in `master-data.router.test.ts`; `auditService.record` called on success and not on failure._

## D. Frontend usability

- [x] Master-data pages are integrated into the authenticated shell.
      _Evidence: `MasterDataView.tsx` integrated in `AuthenticatedView.tsx` with dedicated navigation tabs._
- [x] Forms use actual schema fields and validation.
      _Evidence: HTML5 form inputs match Zod contract schemas._
- [x] Loading, empty, success, validation-error, and server-error states work.
      _Evidence: Feedback alert banners, loading spinners, empty-state notices, and form error handling implemented._
- [x] Read-only roles do not see enabled write actions.
      _Evidence: Write buttons disabled with informative explanatory tooltips/aria-labels for read-only roles._
- [x] Deactivation asks for confirmation and provides feedback.
      _Evidence: Deactivation confirmation modal prompts user with explanation of historical record preservation._
- [x] Keyboard and accessible label checks pass.
      _Evidence: All inputs linked with `<label htmlFor>`, tablist with aria-selected, modals with role="dialog" and aria-modal._

## E. Automated verification

- [x] `npm run format:check` passes.
- [x] `npm run lint` passes.
- [x] `npm run typecheck` passes.
- [x] `npm test` passes.
- [x] `npm run build` passes.
- [x] PostgreSQL 18 migrations/integration tests execute and pass in GitHub Actions; no silent CI skip.
- [x] GitHub Actions run for the phase commit is green.

## F. Documentation and handoff

- [x] README/API documentation updated.
      _Evidence: Updated `README.md` and added `docs/api/master-data.md`._
- [x] Any schema change has a new reversible migration and updated data dictionary/ERD.
      _Evidence: `database/migrations/003_shifts_is_active.sql` and `docs/database/data-dictionary.md`._
- [x] Actual changed files and test results are reported.
- [x] No unrelated changes or secrets were committed.

## Exit decision

- [x] PASS â€” all required items verified.
