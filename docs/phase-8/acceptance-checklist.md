# Phase 8 Acceptance Checklist — CAPA Management

Marked with verified evidence following complete implementation and automated test execution across contracts, database migrations, API routes, and React web client.

## A. Schema and architecture

- [x] Existing `capa_cases` and `capa_actions` schema inspected and documented in `docs/database/data-dictionary.md`.
- [x] No existing migration was rewritten (`001_initial_schema.sql`, `002_auth_sessions.sql`, `003_downtime_enhancements.sql` remain untouched).
- [x] Required schema enhancements (`priority`, `verification_notes`, and index) delivered as reversible migration `database/migrations/004_capa_enhancements.sql`. Tested `up` -> `down 1` -> `up` cleanly.
- [x] Shared contracts match API/UI behavior: Zod schemas and TypeScript types exported in `@qualityops/contracts` with 48 passing unit tests.

## B. Case workflow

- [x] Authorized users can create, list, search, filter, and view cases (`GET /api/v1/quality/capa`, `GET /api/v1/quality/capa/:id`, `POST /api/v1/quality/capa`).
- [x] Cases link to valid source defect findings and production batches with validation against foreign keys.
- [x] Invalid, missing, or inactive references are rejected with `400 Bad Request`.
- [x] Status transitions are explicitly validated (`OPEN` -> `IN_PROGRESS`/`CANCELLED`, `UNDER_REVIEW`, `CLOSED`); direct PATCH to `CLOSED` is strictly rejected.
- [x] Historical cases cannot be hard-deleted (DELETE returns `404 Not Found`).

## C. Actions

- [x] Authorized users (`ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`) can add corrective/preventive/containment actions with owners and due dates.
- [x] Authorized owners can complete assigned actions with required completion notes (`POST /:id/actions/:actionId/complete`). Non-managers cannot complete others' actions.
- [x] Parent-child isolation enforced: actions cannot be accessed or updated through another case's ID (`404 Not Found`).
- [x] Action completion requires non-empty completion notes and automatically progresses parent case to `UNDER_REVIEW` when all actions complete.

## D. Verification and closure

- [x] Case cannot be closed or verified with incomplete required actions (`countPendingActions > 0` returns `400 Bad Request`).
- [x] Case cannot close before verification passes (`verified_by IS NOT NULL` enforced by application logic and `chk_capa_closed_verified`).
- [x] Failed verification returns case to `IN_PROGRESS` without populating `verified_by`.
- [x] Independent Verifier Rule: action owners cannot verify their own case unless holding the `ADMIN` role.
- [x] Verification identity, outcome, timestamp, and notes are persisted.
- [x] Concurrent requests cannot bypass closure preconditions due to serializable/transactional checks.

## E. Security and audit

- [x] All routes have positive and negative RBAC tests (24/24 integration tests in `capa.router.test.ts`).
- [x] No client-supplied identity/role grants privilege (`req.user.id` derived from verified JWT session).
- [x] Case/action mutations and audit events are executed atomically in the same database transaction.
- [x] Audit data contains sanitized before/after metadata with no credentials or secrets.
- [x] No hard-delete endpoint exists for historical CAPA records or action items.

## F. Frontend

- [x] Case list, KPI cards, multi-filters (status, priority, source, overdue SLA), detail view, actions table, verification modal, and closure modal render cleanly in `CapaManagementView.tsx`.
- [x] Responsive layout with accessible forms, status badges, and inline validation messages.
- [x] Read-only users cannot trigger privileged modals or mutations.
- [x] Server-side permission enforcement is tested independently of the UI via Supertest API integration tests.

## G. Quality gates

- [x] `npm run format:check` — Prettier formatting clean across monorepo.
- [x] `npm run lint` — ESLint flat config clean with zero warnings/errors.
- [x] `npm run typecheck` — TypeScript check passed without errors (`exactOptionalPropertyTypes`).
- [x] `npm test` — All unit and integration tests passing:
  - `@qualityops/contracts`: 48/48 passed
  - `@qualityops/web`: 7/7 passed
  - `@qualityops/api`: 215/215 passed across 15 test suites
  - Database schema constraints: 20/20 passed including `chk_capa_closed_verified` and `chk_capa_action_completed`
- [x] `npm run build` — Production builds succeed for contracts, API, and web.
- [x] Documentation updated: `docs/api/capa-management.md`, `docs/capa/capa-workflow.md`, `docs/database/data-dictionary.md`, `README.md`.
- [x] Phase boundaries respected: Phase 8 only; no Phase 9 or predictive analytics implemented.

## Exit decision

- [x] **PASS** — Every applicable mandatory item has verified test evidence and clean quality gates.
