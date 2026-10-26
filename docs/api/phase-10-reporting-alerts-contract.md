# QualityOps Phase 10 — Proposed API Contract

This is a proposal, not permission to blindly implement the literal paths. Inspect existing routing conventions and adapt names while preserving these capabilities.

## Reports

- `GET /api/v1/reports` — list supported report types, filters, formats, and descriptions available to the caller.
- `GET /api/v1/reports/:reportType` — return a filtered report payload for the UI.
- `GET /api/v1/reports/:reportType/export?format=csv|xlsx|pdf&...filters` — generate a bounded export with correct content headers.
- `GET /api/v1/reports/schedules` — list schedules allowed to the caller.
- `POST /api/v1/reports/schedules` — create a validated schedule.
- `PATCH /api/v1/reports/schedules/:id` — update allowed schedule fields or disable it.
- `GET /api/v1/reports/schedules/:id/runs` — run history for an authorized schedule.
- `GET /api/v1/reports/artifacts/:artifactId` — download an authorized generated artifact by opaque ID, never a filesystem path.

## Alerts

- `GET /api/v1/alerts` — paginated list with status, type, severity, date, and entity filters.
- `GET /api/v1/alerts/:id` — detail view including rule, observed value, threshold, related entity, and lifecycle history.
- `POST /api/v1/alerts/evaluate` — trigger a protected, bounded evaluation if the architecture supports a safe manual trigger.
- `POST /api/v1/alerts/:id/acknowledge` — acknowledge an open alert.
- `POST /api/v1/alerts/:id/resolve` — resolve with required notes/reason where appropriate.
- `GET /api/v1/alerts/rules` and authorized `POST`/`PATCH` endpoints if configurable rules are in scope.

## API requirements

- Use shared Zod request/response contracts in `@qualityops/contracts`.
- Reuse authentication and server-side RBAC. Define permissions per report and alert operation; do not rely on hidden UI controls as security.
- Validate date ranges, filters, pagination, output formats, schedule timezones/cadence, and IDs.
- Use parameterized SQL, consistent error envelopes, safe error messages, and audit logging.
- Large exports must be bounded and should stream or page through data.
- Report/alert APIs must not expose password hashes, refresh tokens, secrets, arbitrary local paths, or unrestricted internal errors.
