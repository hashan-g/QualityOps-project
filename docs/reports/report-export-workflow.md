# QualityOps Phase 10 — Reporting & Export Workflow

## Objective

Provide consistent, filterable, role-protected reports and downloadable artifacts for manufacturing production and quality operations. A report must describe its period, filters, generation time, and metric definitions so that people do not confuse unlike measurements.

## Initial report catalog

1. **Production Performance**
   - Batch counts by status; planned, produced, accepted, scrap, and rework-pending quantities; output over time; downtime duration where available.
   - Do not infer a production yield from inspection sample outcomes.
2. **Quality Inspection Summary**
   - Completed inspection count; sum of sample sizes; sum of passed and failed sample units; inspection failure proportion based on `failed_units / sample_size`.
   - In-progress/cancelled inspections must be excluded from completed-outcome metrics and explicitly labelled if shown separately.
3. **Defect Analysis**
   - Finding record count, occurrence count, and affected-unit count as separate measures; breakdown by defect type/severity/product/line/shift; Pareto ranking.
   - Never label a sum of affected units across different defect types as unique defective products unless the data supports unit-level deduplication.
4. **CAPA Status & Action Tracker**
   - Cases by status/priority/source; overdue cases; action completion; verification and closure data.
5. **SPC Summary**
   - Summarize existing p-chart outputs and signals only when the existing SPC service returns `READY`.
   - `INSUFFICIENT_DATA` and `DEGENERATE_BASELINE` must be represented as informative statuses, not as zero signals or a green/stable process.

## Shared filters

- `from` and `to`, with validation that `from <= to` and the maximum range is 366 days unless repository conventions require a stricter cap.
- Product, production line, shift, batch, status, severity, priority, and report-specific filters only where meaningful.
- Validate all filters in the API using the shared contract schemas; do not trust frontend-only validation.

## Export formats

- **CSV:** safe quoting, UTF-8, stable column headings, consistent date/time format, proper escaping, and spreadsheet-formula injection protection for untrusted text beginning with formula-trigger characters.
- **XLSX:** typed cells for numbers/dates, no formulas derived from user-controlled strings, sheet names and row counts handled safely. Prefer an established library already in the repository if suitable; otherwise add a reviewed, pinned dependency.
- **PDF:** readable title, generation timestamp, selected period/filters, metric definitions, page numbers where supported, and clear handling of long tables. Do not claim a PDF was generated if rendering failed.
- Exports must use the same query/service and business definitions as the on-screen report; do not maintain different calculations for charts and downloads.
- Responses must use correct `Content-Type` and safe `Content-Disposition` filenames. Do not expose local filesystem paths.

## Scheduled report workflow

- Authorized users can define a schedule from a supported report, allowed filters, output format, cadence (`DAILY`, `WEEKLY`, `MONTHLY`), timezone, enabled flag, and creator.
- Persist schedule definitions and run history. A failed run must be recorded with a safe error summary and allow later retry; do not mark it successful if no artifact exists.
- Avoid placing a long-running scheduler inside the HTTP request lifecycle. Prefer an explicit one-shot worker command (for example `npm run reports:run-due`) invoked by an OS scheduler / deployment scheduler. The worker must safely claim due rows and avoid duplicate concurrent execution (transactional lock / `FOR UPDATE SKIP LOCKED` or an equivalent demonstrated approach).
- Store generated files outside public web roots, in a configurable directory ignored by Git. Prevent path traversal and use opaque artifact IDs. Only authorized users may download artifacts.
- If no email delivery provider exists, do not fake email delivery. Document email delivery as deferred or implement it only when a real configured provider is available, with secrets supplied via environment configuration.

## Security and reliability

- Reuse the existing authentication, RBAC, validation, and audit services.
- Report/export access must be no broader than the user's access to the underlying data. Do not let a viewer schedule or download manager-only data by guessing a run ID.
- Bound date ranges and result sizes; avoid loading unlimited rows into memory. Use streaming/pagination where appropriate.
- Audit report generation, schedule changes, and artifact downloads where consistent with the existing audit model; never log report contents or secrets.
- Retain records and audit data; do not add destructive deletes for historical production, inspection, defect, or CAPA records.
