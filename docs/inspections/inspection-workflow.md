# QualityOps — Quality Inspection Workflow (Phase 6)

## Purpose

Record and review sample-based quality inspections against existing production batches. The inspection record captures how many units were sampled and how many passed or failed. Detailed defect categorization and Pareto/defect analytics remain in the later defect-management phase.

## Actors

- **ADMIN**: read inspections, create inspections, correct records when necessary.
- **QUALITY_MANAGER**: read, create, and correct inspections; review quality outcomes.
- **INSPECTOR**: read and create inspections; does not delete or silently rewrite submitted historical records.
- **SUPERVISOR, OPERATOR, VIEWER**: read-only inspection access according to the current canonical RBAC policy.

Implementation must inspect and reuse the existing auth middleware and canonical role constants rather than duplicating them or introducing new role names.

## Proposed workflow

1. The inspector opens Quality Inspections and chooses an eligible production batch.
2. The inspector selects the inspection type supported by the existing schema/contracts.
3. The inspector enters sample size, passed units, failed units, inspection timestamp, and optional notes.
4. The backend validates the batch, actor, and sample numbers. The inspector identity is derived from the authenticated session rather than trusted from a client-supplied ID.
5. The backend persists the inspection in a database transaction and records the audit event.
6. The API returns the saved record. The UI shows a clear PASS/FAIL result, derived from the persisted inspection semantics.
7. Authorized users can search/filter inspections and open the record details.
8. Only ADMIN or QUALITY_MANAGER can correct a previously submitted record; corrections must produce an audit entry with before/after snapshots. No hard-delete endpoint is provided.

## Batch eligibility proposal

For this phase, allow inspections on batches in `IN_PROGRESS`, `ON_HOLD`, or `COMPLETED` states. Reject `PLANNED` and `CANCELLED` batches. This permits in-process, hold-investigation, and final inspection. If the repository's already-approved workflow or schema states differ, the implementation agent must document the conflict and follow the existing approved rule rather than silently changing production lifecycle behavior.

## User interface

- Inspection list with server-side pagination.
- Filters for batch, inspection type, result, inspector, and date range where supported by the current data model.
- Create-inspection form with batch selection populated from the real production API.
- Inspection detail view showing batch context, sample numbers, result, recorded inspector, timestamp, and notes.
- Edit/correction controls visible only to permitted roles.
- Loading, empty, success, validation, and server-error states.
- No fake production or inspection records in the application UI.

## Out of scope

- Full defect taxonomy CRUD (already present as master data; defect findings are a later phase).
- CAPA case/action workflows.
- Defect Pareto dashboard and control charts.
- AI/ML analysis, notifications, reports or exports.
- Changing previous migration files or reimplementing authentication.
