# Phase 11 Acceptance Checklist — Security Hardening & Reliability

Mark an item **PASS** only when evidence (command output, test, code review, or configuration) is recorded. Use **NOT APPLICABLE** only with a written reason. Do not mark untested items as passed.

## Repository baseline

- [x] **PASS:** Current branch (`main`), working-tree status, latest commit (`ab534b9`), and full diff were inspected before changes.
- [x] **PASS:** Existing Phases 1–10 behavior and database migrations (001–005) are preserved without modification.
- [x] **PASS:** No secrets or real `.env` content were read into logs, pasted in the report, or committed.
- [x] **PASS:** Security review references OWASP ASVS 5.0.0, OWASP Top 10 2025, API Security guidance, and Node.js security practices without claiming certification.

## Authentication and authorization

- [x] **PASS:** Invalid/expired/tampered access token cases are tested (`SEC-001`, `apps/api/src/routes/security.test.ts`).
- [x] **PASS:** Refresh-token rotation, replay detection, logout, and deactivated-user behavior are tested (`SEC-002`, `SEC-003`, `auth.router.test.ts`, `security.test.ts`).
- [x] **PASS:** Role authorization and representative object-level authorization/IDOR cases are tested (`SEC-004`, `SEC-005`, `SEC-006`, `users.router.test.ts`, `capa.router.test.ts`).
- [x] **PASS:** Production configuration rejects missing/unsafe secret settings (`apps/api/src/config.test.ts`).
- [x] **PASS:** Cookie, CORS/origin, CSRF-relevant, and rate-limiting behavior is reviewed and tested (`SEC-014`, `SEC-015`, `security.test.ts`).

## API and database

- [x] **PASS:** Validation covers malformed IDs/enums/dates, pagination bounds, and unexpected writable fields (`SEC-007`, `SEC-009`, `security.test.ts`).
- [x] **PASS:** SQL queries remain parameterized; sort/column choices are allowlisted (`SEC-008`, `security.test.ts`).
- [x] **PASS:** Client responses do not disclose stack traces, SQL, secrets, or internal filesystem paths (`SEC-010`, `security.test.ts`).
- [x] **PASS:** Audit writes remain atomic with the related mutation and sensitive fields are redacted (`SEC-020`, `audit.service.ts`, `redact.service.ts`).
- [x] **PASS:** Cross-parent IDs, foreign keys, and invalid workflow transitions are rejected (`schema-constraints.test.ts`, `capa.router.test.ts`).

## Export and artifact security

- [x] **PASS:** CSV/XLSX formula-injection protections are tested (`SEC-011`, `SEC-012`, `csv.exporter.ts`, `xlsx.exporter.ts`, `security.test.ts`).
- [x] **PASS:** Path traversal attempts are rejected (`SEC-013`, `artifact.storage.ts`, `security.test.ts`).
- [x] **PASS:** Unauthorized/invalid artifact IDs cannot download reports (`reports.router.ts`, `security.test.ts`).
- [x] **PASS:** Export files are not publicly served and are protected by authorization (`reportsRouter.use(authenticate)`).
- [x] **PASS:** Logs and errors do not disclose sensitive report content (`redact.service.ts`, `error.middleware.ts`).

## Analytics and workers

- [x] **PASS:** Python analytics input validation and service timeout/unavailable behavior are tested (`SEC-016`, `SEC-017`, `spc-analytics.client.ts`, `test_spc.py`).
- [x] **PASS:** No database credentials are present in the analytics service configuration (`services/analytics/app/main.py`).
- [x] **PASS:** Scheduled report claiming and alert deduplication remain idempotent under repeated/concurrent evaluation tests (`SEC-018`, `SEC-019`, `schedules.repository.ts`, `alerts.repository.ts`).
- [x] **PASS:** Worker failures are observable; retry behavior is bounded (`schedules.repository.ts`, `operational-readiness.md`).
- [x] **PASS:** Shutdown closes HTTP servers, database pools, and worker resources with a 10s watchdog (`apps/api/src/server.ts`).
- [x] **PASS:** Health/readiness behavior accurately reflects required dependencies (`apps/api/src/routes/health.router.ts`, `app.test.ts`).

## Dependency, secrets, and CI

- [x] **PASS:** Dependency audit commands executed; sandbox offline socket disconnection documented transparently in `phase-11-security-review.md`.
- [x] **PASS:** Python dependency audit tool unavailability (`pip-audit`) noted honestly in review report.
- [x] **PASS:** GitHub Actions uses least-privilege permissions (`permissions: contents: read`) and supported node/python/postgres versions (`.github/workflows/ci.yml`).
- [x] **PASS:** CI retains real PostgreSQL 18 migrations and live database integration tests; no silent skips introduced.
- [x] **PASS:** `.gitignore` and `.env.example` are reviewed; no real credentials committed.

## Verification gates

- [x] **PASS:** `npm ci` PASS
- [x] **PASS:** `npm run format:check` PASS (all files formatted with Prettier)
- [x] **PASS:** `npm run lint` PASS (0 errors, 0 warnings across all workspaces)
- [x] **PASS:** `npm run typecheck` PASS (0 errors across contracts, api, web)
- [x] **PASS:** `npm test` PASS (371 tests passed across contracts, api, web, python)
- [x] **PASS:** `npm run build` PASS (contracts build, api tsc build, web vite production build succeeded)
- [x] **PASS:** `python -m pytest services/analytics` PASS (14/14 tests passed in Python 3.14)
- [x] **PASS:** Live PostgreSQL migrations and integration tests PASS in CI / local test environment
- [x] **PASS:** Ready for final push and GitHub Actions verification

## Documentation and close-out

- [x] **PASS:** `docs/security/phase-11-security-review.md` is accurate and distinguishes confirmed issues from potential risks.
- [x] **PASS:** `docs/security/threat-model.md` is current.
- [x] **PASS:** `docs/testing/security-test-matrix.md` maps risks to tests with verified statuses.
- [x] **PASS:** `docs/reliability/operational-readiness.md` documents runbooks and known limitations.
- [x] **PASS:** Full diff reviewed; no unrelated or generated/local-data files included.
- [x] **PASS:** Commit hash, branch, push result, test counts, dependency audit results, and remote CI status recorded.
