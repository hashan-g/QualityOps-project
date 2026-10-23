# QualityOps Phase 2 — Database Schema Blueprint

This blueprint is a design aid for Phase 2 and must be reconciled with the repository's accepted Phase 0/Phase 1 documents before implementation.

## Main relationships

- `users` ↔ `roles` through `user_roles` (many-to-many).
- `production_batches` belongs to one `product`, `production_line`, and `shift`; it may reference a `machine` and creator.
- `machines` belongs to a `production_line` in the initial model.
- `quality_inspections` belongs to a `production_batch` and the inspecting user.
- `defect_records` belongs to one inspection and one defect type. Store defect occurrence count separately from affected-unit count.
- `capa_cases` may link to a batch and/or defect record, and has a responsible owner and creator.
- `capa_actions` belongs to a CAPA and can have an owner and due date.
- `downtime_records` refers to the affected line/machine and optionally a production batch.
- `audit_logs` records actor, action, entity reference, request ID, timestamp, and relevant before/after JSON snapshots without storing secrets.

## Recommended baseline entities

1. `users`
2. `roles`
3. `user_roles`
4. `products`
5. `production_lines`
6. `machines`
7. `shifts`
8. `defect_types`
9. `production_batches`
10. `quality_inspections`
11. `defect_records`
12. `capa_cases`
13. `capa_actions`
14. `downtime_records`
15. `audit_logs`

Create `notifications` only if the accepted Phase 0 specification requires it in the current schema; otherwise defer it until its feature phase.

## Important count definitions

- `produced_quantity`: total units produced for the batch.
- `accepted_quantity`: units currently accepted as good output.
- `scrap_quantity`: units permanently scrapped.
- `rework_pending_quantity`: units not yet accepted or scrapped and currently awaiting rework. These are mutually exclusive current disposition buckets; reworked units must move out of the pending bucket when their disposition changes.
- `sample_size`, `passed_units`, `failed_units`: describe the inspected sample only; `passed + failed = sample_size` for a completed inspection.
- `occurrence_count`: how many defect occurrences were recorded in an inspection.
- `affected_unit_count`: how many inspected units were affected by that defect type in that record. One unit can appear in multiple defect categories, so category counts cannot necessarily be summed into a unique defect-unit count.
- Whole-batch yield should be derived from accepted quantity / produced quantity if that is the approved business definition.
- `inspection_failure_rate` = failed units / sample size × 100. Do not label this whole-batch defect rate.
- First-pass yield requires first-attempt inspection information and a clearly specified denominator; do not infer it from final accepted quantity alone.

## Integrity rules

- Quantities must be integers and non-negative.
- Production disposition buckets cannot exceed produced quantity; a completed batch must reconcile exactly to produced quantity.
- For completed inspections, sample size must be positive and passed + failed must equal sample size.
- Defect counts must be non-negative; occurrence/affected-unit semantics must be documented.
- An end timestamp must be later than its start timestamp.
- Closed CAPA cases require recorded verification and all mandatory actions completed.
- Important changes should be auditable; audit history should not be casually editable through normal application operations.

## Indexing guidance

Add indexes based on expected filters and joins, for example:

- foreign-key columns used by batch/inspection/defect/CAPA relations
- `production_batches(produced_at)`, `(production_line_id, produced_at)`, `(product_id, produced_at)`
- `quality_inspections(batch_id, inspected_at)`
- `defect_records(inspection_id, defect_type_id)`
- `capa_cases(status, due_date)` and `(assigned_to, status)`
- `downtime_records(machine_id, started_at)`

Avoid redundant indexes and confirm that unique constraints already create appropriate indexes.
