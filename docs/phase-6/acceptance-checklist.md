# QualityOps Phase 6 — Acceptance Checklist

Use evidence from the repository, actual command output, and the remote GitHub Actions run. Do not mark an item PASS based only on generated code or an agent's unsupported claim.

## A. Scope and architecture

- [x] Current Phase 2 schema, Phase 3 authentication/RBAC, Phase 4 master data, and Phase 5 production flows were inspected before implementation.
- [x] `quality_inspections` schema was verified from the actual migrations; column names and enums were not guessed.
- [x] Previous migrations `001`, `002`, and `003` remain unchanged.
- [x] A new reversible migration was added only if the existing schema cannot support the needed feature (verified existing schema fully satisfies Phase 6).
- [x] No Phase 7 full defect-management, CAPA, or advanced analytics scope was added.

## B. API and contracts

- [x] Shared Zod contracts cover inspection create/update/query/response payloads.
- [x] `GET /api/v1/quality/inspections` supports safe pagination and applicable filters.
- [x] `GET /api/v1/quality/inspections/:id` returns the record with appropriate batch/inspector context.
- [x] `POST /api/v1/quality/inspections` creates a valid inspection.
- [x] `PATCH /api/v1/quality/inspections/:id` supports controlled corrections only if consistent with the approved design.
- [x] No hard-delete endpoint exists.
- [x] API errors use the existing shared error envelope and appropriate HTTP status codes.

## C. Business rules and integrity

- [x] Sample size must be a positive integer.
- [x] Passed and failed counts are non-negative integers.
- [x] Passed + failed equals sample size for fully classified samples.
- [x] A single inspection's sample size cannot exceed the batch's produced quantity at inspection time.
- [x] Result is derived/validated server-side and cannot contradict sample counts.
- [x] Batch eligibility follows the documented workflow.
- [x] Historical production quantities are not modified by inspection sample results.
- [x] Inspector identity comes from the authenticated user unless an existing approved delegation flow exists.

## D. RBAC, audit and security

- [x] All endpoints require authentication.
- [x] Read access follows the current canonical role matrix.
- [x] Create permissions are limited to approved roles (ADMIN, QUALITY_MANAGER, INSPECTOR by default).
- [x] Corrections are limited to ADMIN and QUALITY_MANAGER by default.
- [x] Forbidden roles receive 403; unauthenticated users receive 401.
- [x] Create/correction actions are audited with actor, action, entity, request ID and before/after data where supported.
- [x] No secrets or token values leak into responses or logs.

## E. Frontend

- [x] Quality Inspections is integrated into the existing authenticated app without breaking other navigation.
- [x] Batch selection uses the real Phase 5 API, not hard-coded mock data.
- [x] List/search/filter/pagination and detail view work against the API.
- [x] Create and permitted correction forms show inline validation.
- [x] Loading, empty, success, forbidden, and failure states are handled.
- [x] Role-aware actions reflect backend permissions (frontend visibility is not the security boundary).
- [x] UI is keyboard accessible and responsive.

## F. Tests and verification

- [x] Contract tests cover valid and invalid payloads.
- [x] API tests cover list, detail, create, correction (if implemented), 401/403, not-found, and invalid data.
- [x] PostgreSQL integration tests verify actual persisted inspections, foreign keys, check constraints, and transactional audit behavior where applicable.
- [x] Database integration tests do not silently skip in CI.
- [x] `npm ci` passes.
- [x] `npm run format:check` passes.
- [x] `npm run lint` passes with zero warnings/errors.
- [x] `npm run typecheck` passes.
- [x] `npm test` passes.
- [x] `npm run build` passes.
- [ ] GitHub Actions run is green on the pushed commit.

## Exit decision

- **PASS** only when all applicable checks are evidenced and the remote CI run is green.
- **BLOCKED** if live PostgreSQL integration checks cannot be demonstrated.
- **FAIL** if a required rule or quality gate fails.
