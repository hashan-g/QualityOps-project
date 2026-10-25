# QualityOps — Inspection Data Rules

These rules guide Phase 6. Before implementing them, inspect the actual schema in `database/migrations/001_initial_schema.sql`, later migrations, and the current contract definitions. If an existing constraint or approved rule conflicts with this document, stop and report the conflict rather than silently changing history.

## Measurement semantics

- **Production quantity**: the quantity recorded for a production batch.
- **Inspection sample size**: the number of units included in one inspection event.
- **Passed units / failed units**: the disposition of units in that inspection sample only.
- **Defect occurrence count**: the number of defect occurrences, which is not necessarily the same as the number of affected units.
- Inspection samples from separate inspections may overlap; do not sum their sample sizes and treat that total as unique inspected production units.
- Inspection sample results are not the same as a production batch's accepted, scrap, or rework-pending quantities.

## Numeric validations

- `sample_size` must be a positive integer.
- `passed_units` and `failed_units` must be non-negative integers.
- For a fully classified sample, `passed_units + failed_units = sample_size`.
- `failed_units` cannot exceed `sample_size`; the previous equality rule also implies `passed_units` cannot exceed it.
- `sample_size` for one inspection cannot exceed the batch's recorded `produced_quantity` at the time of inspection. Do not use cumulative sample sizes from other inspections for this check because re-inspection may resample the same units.
- Validate cross-field rules in the API contract and service layer; use database constraints as a final integrity layer where consistent with the current schema design.

## Result semantics

- If the existing schema stores an inspection result, derive or validate it server-side.
- Proposed initial rule: `PASS` when `failed_units = 0`; `FAIL` when `failed_units > 0`.
- Never trust a client-supplied result if it conflicts with the sample counts.
- If the existing schema uses different approved inspection outcome semantics or acceptance criteria, document that and follow the canonical schema instead of introducing a conflicting enum.

## Persistence and audit

- Use a transaction for saving an inspection and its audit entry when the repository's audit service supports the same transaction client. Do not claim atomicity if the services use different connections.
- Derive the inspector ID from authenticated identity unless an explicitly authorized on-behalf-of workflow already exists.
- Store timestamps consistently with the existing database conventions.
- Never log passwords, JWTs, refresh tokens or other credentials.
- Do not hard-delete submitted inspection history. Corrections must be authorized and audited.
