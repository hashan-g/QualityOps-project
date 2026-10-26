# QualityOps Phase 10 — Operational Alert Rules

## Purpose

Create actionable, traceable alerts from existing production, inspection, defect, CAPA, and SPC data. Alerts are decision-support signals, not automatic diagnoses or proof of root cause.

## Initial alert types

### 1. High inspection failure proportion

- Source: completed `quality_inspections` only.
- Metric per inspection: `failed_units / sample_size` where `sample_size > 0`.
- Threshold: configurable rule value, with a documented default only if product requirements approve it.
- Use the inspection's denominator. Do not substitute `defect_records.occurrence_count`, `affected_unit_count`, production scrap, or batch disposition quantities.
- A threshold alert indicates review is required; it is not automatically an SPC out-of-control signal.

### 2. Overdue CAPA

- Source: `capa_cases` plus current case state and due date.
- Condition: due date has passed and status is neither `CLOSED` nor `CANCELLED`.
- Re-evaluate when the case is closed/cancelled, the due date changes, or the periodic evaluation worker runs.

### 3. SPC out-of-control signal

- Source: existing Phase 9 p-chart analytics output.
- Generate only when status is `READY` and a subgroup has `ABOVE_UCL` or `BELOW_LCL` signal.
- Do not generate an out-of-control alert for `INSUFFICIENT_DATA`, `DEGENERATE_BASELINE`, service failure, or an empty result.
- Preserve the SPC meaning: a signal asks for investigation; control limits are not specification limits.

## Persistent lifecycle

- Recommended statuses: `OPEN`, `ACKNOWLEDGED`, `RESOLVED`, `SUPPRESSED` only if suppression rules are explicitly implemented.
- Acknowledge must capture actor and timestamp.
- Resolve must capture actor and timestamp plus a reason where appropriate.
- Every state mutation should be audited.
- Do not permanently delete historical alerts.

## Deduplication and idempotency

- Generate a deterministic fingerprint from rule type + relevant entity/context + time-window or business key.
- Re-evaluation must not create a new duplicate alert every time the worker runs.
- Define re-open behavior if an issue recurs after resolution; document and test it.
- Use database uniqueness/transactional behavior to prevent races between concurrent evaluators.

## Evaluation

- Support a protected manual evaluation endpoint and a one-shot worker command if appropriate to the existing deployment approach.
- Evaluate within bounded date/data windows.
- Worker failures must be logged safely and must not alter source production, inspection, defect, or CAPA records.
- Use explicit tests for threshold boundaries, overdue status transitions, SPC service degradation, deduplication, and authorization.
