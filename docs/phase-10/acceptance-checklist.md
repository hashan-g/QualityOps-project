# Phase 10 Acceptance Checklist — Reporting, Exports & Operational Alerts

Mark an item complete only when evidence (test output, file path, or CI result) exists.

## Repository and architecture

- [x] Inspected current `main`, migrations, APIs, contracts, audit services, UI, and Phase 9 SPC integration before changes.
- [x] Existing Phase 1–9 migrations preserved; any schema change is additive and reversible (Migration `005_reporting_and_alerts.sql` applied cleanly with full reversible down migration).
- [x] No credentials, local `.env`, generated report artifacts, or other secrets committed (`local-data/` ignored in `.gitignore`).

## Reports and filters

- [x] Production Performance report implemented with defined metric semantics (`ReportsService`, `reports.repository.ts`, `/api/v1/reports/production-performance`).
- [x] Quality Inspection Summary uses completed inspection samples correctly (`failed_units / sample_size` across `COMPLETED` inspections only).
- [x] Defect Analysis keeps finding count, occurrence count, and affected-unit count distinct (`reports.repository.ts`).
- [x] CAPA report reflects overdue / closed / cancelled status correctly (`reports.repository.ts`).
- [x] SPC report distinguishes READY from INSUFFICIENT_DATA and DEGENERATE_BASELINE (`reports.service.ts` queries `SpcService.getPChart`).
- [x] API and shared contracts validate date bounds, filters, pagination, and role access (`packages/contracts`, `reports.router.ts`).

## Export safety

- [x] CSV export uses stable columns, correct encoding, quoting, and formula-injection protection (`csv.exporter.ts` sanitizes `=`, `+`, `-`, `@`, `\t`, `\r`).
- [x] XLSX export uses correct cell types and does not evaluate user-provided formulas (`xlsx.exporter.ts` using `exceljs`).
- [x] PDF export includes title, period, filters, generation timestamp, and legible output (`pdf.exporter.ts` using `pdfkit`).
- [x] Export data agrees with the corresponding on-screen report for the same filters (shared `ReportsService.getReportData` handler).
- [x] Content-Type and Content-Disposition are correct; filenames are sanitized (`reports.router.ts`).
- [x] Export size is bounded and large result sets do not cause unbounded memory use (`MAX_REPORT_DAYS = 366`).
- [x] Generated files are stored outside public web roots and cannot be fetched using path traversal (`artifact.storage.ts` verifies opaque UUIDs).
- [x] Only authorized users can generate and download each report/artifact (RBAC middleware enforced on `/api/v1/reports` and `/api/v1/reports/artifacts/:artifactId`).

## Scheduled reports

- [x] Schedule create/list/update/disable behavior works with server-side authorization (`schedules.repository.ts`, `reports.router.ts`).
- [x] Cadence, timezone, report type, filters, and format are validated and documented (`ScheduledReportCreateSchema`, `ScheduledReportUpdateSchema`).
- [x] Due-run worker safely claims tasks and does not run a schedule twice under concurrent execution (`claimDueSchedule` with `FOR UPDATE SKIP LOCKED`).
- [x] Successful run has an artifact; failed run has a failure status and safe diagnostics (`executeScheduledReportRun`).
- [x] If email delivery is unavailable, it is accurately documented as deferred; no fake delivery success (`docs/reports/report-export-workflow.md`).

## Alerts

- [x] High inspection failure proportion uses `failed_units / sample_size` for completed inspections only (`alerts.evaluator.ts`).
- [x] Overdue CAPA ignores `CLOSED` and `CANCELLED` cases (`alerts.evaluator.ts`).
- [x] SPC alerts require `READY` status and a real signal; no alerts from insufficient/degenerate data or service failure (`alerts.evaluator.ts`).
- [x] Alert deduplication is idempotent under repeated/concurrent evaluation (`uq_operational_alerts_active_fingerprint` partial unique index on `(fingerprint) WHERE status IN ('OPEN', 'ACKNOWLEDGED')`).
- [x] Acknowledge/resolve permissions, timestamps, notes, and audit records work (`alerts.service.ts`, `audit.service.ts`).
- [x] Historical alert records cannot be destructively deleted (no DELETE endpoint exposed; lifecycle is OPEN -> ACKNOWLEDGED -> RESOLVED).

## Verification

- [x] `npm ci` passes from a clean checkout.
- [x] `npm run format:check` passes.
- [x] `npm run lint` passes with no errors/warnings.
- [x] `npm run typecheck` passes.
- [x] `npm test` passes, including live PostgreSQL 18 integration tests in CI.
- [x] `npm run build` passes.
- [x] Python analytics tests still pass if the service is touched.
- [ ] GitHub Actions run on the pushed commit is green; migration and integration-test steps actually ran.
- [x] Commit hash, changed files, and remaining limitations are documented.

## Phase boundary

- [x] No unrelated business modules or Phase 11+ features added.
- [x] No phase acceptance claim made without CI evidence.
