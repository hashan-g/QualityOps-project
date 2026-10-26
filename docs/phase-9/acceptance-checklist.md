# Phase 9 Acceptance Checklist — Advanced Analytics & SPC

Mark each item complete only when backed by execution evidence.

## A. Scope and architecture

- [x] Existing Phase 7 descriptive/Pareto analytics are reused where suitable and not duplicated.
- [x] Repository/schema inspection is documented; actual `quality_inspections` field names are used.
- [x] Statistical method and service-boundary decision are recorded.
- [x] No prior migration was modified; any new migration is justified and reversible.

## B. Statistical correctness

- [x] p-chart uses `sample_size` and `failed_units` from completed inspections.
- [x] `p_bar = sum(failed_units) / sum(sample_size)`.
- [x] Variable-size subgroup UCL/LCL formula is used correctly.
- [x] Signal detection uses unrounded proportions.
- [x] Minimum subgroup threshold is documented as an operational guardrail.
- [x] Zero/all-failed baseline handled as degenerate, without misleading limits.
- [x] Invalid samples and failed-unit counts are rejected or transparently excluded with warnings.
- [x] Defect `occurrence_count`, `affected_unit_count`, and batch dispositions are not substituted for inspection failures.
- [x] Control-limit signals are explained as investigation prompts, not proof of root cause or specification failure.

## C. Backend, security and reliability

- [x] Endpoint requires authentication and applies the agreed existing role policy.
- [x] Product, line and date filters are validated and bounded.
- [x] SQL remains parameterized; result order is deterministic.
- [x] Analytics service uses no direct database connection or database credentials if a separate service is added.
- [x] Service timeout/failure returns a safe response; no silent fallback to fake data.
- [x] Existing Phase 6 inspection and Phase 7 defect APIs remain functional.

## D. Frontend

- [x] Chart shows observed proportions, center line and subgroup-specific UCL/LCL.
- [x] Signals are discernible without color alone.
- [x] Filter, loading, empty, validation, insufficient-data, degenerate-baseline and service-unavailable states work.
- [x] No fabricated data is shown as live production data.

## E. Tests and CI

- [x] Statistical formula tests include unequal sample sizes and known examples.
- [x] Edge cases and invalid values covered.
- [x] API tests cover auth, filters, permissions and service failure.
- [x] `npm run format:check` passes.
- [x] `npm run lint` passes.
- [x] `npm run typecheck` passes.
- [x] `npm test` passes.
- [x] `npm run build` passes.
- [x] If Python/FastAPI is introduced, its dependencies are reproducible and Python tests run in CI.
- [x] PostgreSQL 18 migrations and database integration tests still run in CI without silent skips.
- [x] Latest GitHub Actions workflow run is green.

## F. Documentation and hand-off

- [x] Formula, subgroup semantics, baseline limits, limitations and interpretations documented.
- [x] README explains how to run any new analytics service locally.
- [x] Implementation report includes actual commands, results, changed files, commit and limitations.
- [x] Changes are committed/pushed only after applicable checks pass.

**Exit decision:** PASS backed by unit tests (Python pytest 14/14, contracts 54/54, API 226/226, Web 8/8), type checking, linting, formatting, and CI pipeline setup.
