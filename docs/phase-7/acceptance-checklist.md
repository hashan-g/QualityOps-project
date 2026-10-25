# Phase 7 Acceptance Checklist — Defect Management & Basic Analytics

Use this checklist only after implementation and tests have run. Do not mark a check as passed without evidence.

## A. Design and scope

- [x] Current schema, Phase 6 inspection workflow, RBAC, audit service, and API conventions were inspected first.
- [x] Existing migrations `001`, `002`, and `003` were not rewritten.
- [x] Any required schema change is in a new reversible migration and documented (Existing schema fully satisfied all requirements; no new migration required).
- [x] Defect findings, occurrences, affected units, sample failures, and production dispositions are clearly distinguished.
- [x] No CAPA, predictive ML, notifications, or advanced control charts were implemented in Phase 7.

## B. API and data integrity

- [x] Authenticated list endpoint supports validated filters, pagination, and deterministic sorting.
- [x] Detail endpoint returns the associated defect type and inspection/batch context.
- [x] Create endpoint validates inspection/type references, status eligibility, and positive count values.
- [x] Client-supplied actor/inspector identity cannot override authenticated identity.
- [x] Correction endpoint enforces role restrictions, required reason, and before/after audit logging.
- [x] No destructive delete route exists for historical defect findings.
- [x] Defect mutation and audit event are atomic within a database transaction.
- [x] Foreign-key conflicts and validation failures return the standard safe error envelope.

## C. Analytics

- [x] Overview distinguishes finding count, occurrence count, and affected-unit count across findings.
- [x] Defects by type and severity use canonical defect type/severity data.
- [x] Product/line/machine/shift filters derive through the existing inspection-to-batch relationship.
- [x] Trend analytics use a documented timestamp and consistent period grouping.
- [x] Pareto chart names the ranking measure and does not claim affected-unit sums are unique units.
- [x] Analytics queries are bounded, parameterized, and tested with empty/non-empty filters.

## D. Frontend

- [x] Defect list has loading, empty, error, and success states.
- [x] Filters and pagination work with server-side queries.
- [x] Create form provides inline validation and useful API errors.
- [x] Read-only roles cannot submit mutation actions.
- [x] Correction modal requires a reason and a confirmation step.
- [x] Analytics are clearly labelled with definitions and filter period.
- [x] UI follows existing responsive/accessibility patterns.

## E. Testing and quality gates

- [x] Contract schema tests cover valid and invalid requests/responses.
- [x] API tests cover all roles, validation, missing references, and correction authorization.
- [x] PostgreSQL integration tests run against the configured PostgreSQL 18 service in CI; they cannot silently skip in CI.
- [x] Tests prove audit writes rollback if a defect mutation fails.
- [x] Existing production, inspection, authentication, and schema-constraint tests still pass.
- [x] `npm ci` passes.
- [x] `npm run format:check` passes.
- [x] `npm run lint` passes.
- [x] `npm run typecheck` passes.
- [x] `npm test` passes.
- [x] `npm run build` passes.
- [ ] GitHub Actions run is green on pushed commit.

## F. Git and documentation

- [x] API specification updated.
- [x] README and Phase 7 checklist updated with real evidence.
- [x] Working tree/diff reviewed before commit.
- [x] Changes are committed on the intended branch and pushed only after applicable checks pass.
- [ ] Commit hash and remote CI result recorded.

## Exit decision

- [ ] **PASS** — All mandatory checks passed with evidence.
- [ ] **BLOCKED** — Environment/CI issue prevents verification; do not proceed as if passed.
- [ ] **FAIL** — One or more implementation/quality checks failed and require correction.
