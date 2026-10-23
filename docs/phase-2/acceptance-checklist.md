# Phase 2 Exit Checklist — Database Design & Implementation

**Phase 2 Evaluation Status:** PASS  
**Completed on:** 23 October 2026  
**Node.js Runtime:** 24.15.0 LTS  
**PostgreSQL Version:** 18.x

---

## A. Schema Design & Domain Semantics

- [x] Canonical entity names reconciled and documented in `docs/database/schema-design.md`.
  - _Evidence:_ Explicitly established `production_batches` as the authoritative run entity (eliminating ambiguous `production_records`).
- [x] Distinct semantics established for production output vs. inspection samples.
  - _Evidence:_ Documented that `sample_size`, `passed_units`, and `failed_units` represent inspected samples only, while batch yields are computed from `production_batches`.
- [x] Defect occurrences and affected units modeled as distinct columns.
  - _Evidence:_ `defect_records` includes `occurrence_count` and `affected_unit_count` with constraint `affected_unit_count <= occurrence_count`. Documented that affected units cannot be summed across categories to derive unique defective units.
- [x] Clear KPI definitions with formulas and denominators.
  - _Evidence:_ `docs/database/schema-design.md` defines `inspection_failure_rate`, `batch_acceptance_rate`, `batch_scrap_rate`, `batch_rework_rate`, and notes limitations.
- [x] ERD and Data Dictionary complete and committed.
  - _Evidence:_ Created [`docs/database/erd.mmd`](file:///docs/database/erd.mmd) and [`docs/database/data-dictionary.md`](file:///docs/database/data-dictionary.md).

## B. Database Relational Implementation

- [x] 14 canonical tables defined in versioned SQL migration under `database/migrations/`.
  - _Evidence:_ `database/migrations/001_initial_schema.sql` defines `users`, `roles`, `user_roles`, `products`, `production_lines`, `machines`, `shifts`, `defect_types`, `production_batches`, `quality_inspections`, `defect_records`, `downtime_records`, `capa_cases`, `capa_actions`, `audit_logs`.
- [x] UUID primary keys used consistently with `gen_random_uuid()`.
  - _Evidence:_ All primary key columns use `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- [x] Non-negative constraints enforced on integer counts.
  - _Evidence:_ `CHECK (>= 0)` on quantities, produced/accepted/scrap/rework, and inspection units.
- [x] Production disposition sum constraint enforced.
  - _Evidence:_ `CONSTRAINT chk_batch_disposition_sum CHECK (accepted_quantity + scrap_quantity + rework_pending_quantity <= produced_quantity)`.
- [x] Batch completion reconciliation rule enforced.
  - _Evidence:_ `CONSTRAINT chk_batch_completed_reconciled CHECK (status <> 'COMPLETED' OR (accepted_quantity + scrap_quantity + rework_pending_quantity = produced_quantity))`.
- [x] Inspection completion reconciliation rule enforced.
  - _Evidence:_ `CONSTRAINT chk_inspection_completed_reconciled CHECK (status <> 'COMPLETED' OR (passed_units + failed_units = sample_size))`.
- [x] CAPA closed verification constraint enforced.
  - _Evidence:_ `CONSTRAINT chk_capa_closed_verified CHECK (status <> 'CLOSED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))`.
- [x] Downtime end instant after start instant enforced.
  - _Evidence:_ `CONSTRAINT chk_downtime_ended_after_started CHECK (ended_at IS NULL OR ended_at > started_at)`.
- [x] Down migration completely reverses schema.
  - _Evidence:_ `001_initial_schema.sql` down migration drops all tables in reverse topological order.

## C. Migration Tooling & Scripts

- [x] `node-pg-migrate` established as the migration framework.
  - _Evidence:_ Configured in `package.json` with scripts `db:migrate`, `db:migrate:down`, `db:migrate:status`, `db:migrate:create`.
- [x] Migrations run safely within transaction blocks.
  - _Evidence:_ Handled automatically by `node-pg-migrate` `--single-transaction`.

## D. Backend Database Integration

- [x] Connection pool created using `pg` with bounded configuration.
  - _Evidence:_ `apps/api/src/infrastructure/database/pool.ts` creates bounded `pg.Pool` with `max`, `idleTimeoutMillis`, `connectionTimeoutMillis` validated via Zod in `apps/api/src/config.ts`.
- [x] Graceful shutdown closes database pool.
  - _Evidence:_ `apps/api/src/server.ts` calls `await closePool()` on SIGTERM/SIGINT.
- [x] Liveness probe remains independent of database.
  - _Evidence:_ `GET /api/v1/health` returns 200 without connecting to DB; tested and verified even when DB is unreachable.
- [x] Dedicated readiness probe actively tests database connectivity.
  - _Evidence:_ `GET /api/v1/health/ready` executes `SELECT 1 AS ready;`; returns 200 when DB is up and 503 when DB is down.
- [x] Credentials never leaked in error envelopes or logs.
  - _Evidence:_ `checkDatabaseReadiness()` sanitizes connection URLs, tested in unit tests.

## E. Quality Checks & CI

- [x] `npm run format:check` passes.
  - _Evidence:_ All files formatted with Prettier.
- [x] `npm run lint` passes.
  - _Evidence:_ ESLint passes with 0 errors and 0 warnings.
- [x] `npm run typecheck` passes.
  - _Evidence:_ Strict TypeScript checks pass across contracts, API, and web.
- [x] `npm test` passes.
  - _Evidence:_ 31 tests passed across 3 workspaces (7 in contracts, 23 in API, 1 in web).
- [x] `npm run build` passes.
  - _Evidence:_ Contracts, API, and Web workspaces compile cleanly into `dist/`.
- [x] CI workflow updated for PostgreSQL 18 service container.
  - _Evidence:_ `.github/workflows/ci.yml` spins up PostgreSQL 18 service container with health checks and runs `npm run db:migrate`, `db:migrate:status`, and `npm test`.

## F. Repository Hygiene & Environmental Status

- [x] `.env.example` restored and updated with database pool variables.
- [x] `.env` is untracked and excluded in `.gitignore`.
- [x] Docker availability observed and recorded honestly.
  - _Evidence:_ Docker Desktop running on host, but network DNS failed to resolve Docker Hub during image pull. Native PostgreSQL 18 service is running on Windows host. Tests run safely without hard dependency on active external DB, while CI executes against dedicated PostgreSQL service container.
- [x] No business APIs or UI business features implemented early.
  - _Evidence:_ Only diagnostic readiness probe added to API; zero business endpoints created.

---

## Exit Decision

- [x] **PASS:** Phase 2 data foundation, schema, migration tooling, readiness diagnostics, and documentation are complete.
- [ ] **HOLD**
