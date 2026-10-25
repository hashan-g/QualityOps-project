# QualityOps — Defect Data Rules

**Status:** Proposed Phase 7 implementation baseline; verify against current repository schema and existing Phase 0 requirements before coding.

## 1. Purpose

Defect records capture quality findings discovered during a quality inspection. They must link to the relevant inspection and standardized defect type, preserve auditability, and support descriptive analysis by defect type, product, production line, machine, shift, and date range.

## 2. Distinguish the measures

These quantities are not interchangeable:

- **Defect records:** Number of stored defect findings/rows.
- **Occurrence count:** Number of occurrences recorded for a defect finding.
- **Affected-unit count:** Number of inspected units affected by that defect finding.
- **Inspection sample size:** Number of units sampled in one inspection.
- **Inspection failed units:** Number of sampled units that failed the inspection.
- **Production rejected/scrap units:** Production disposition quantities recorded on the production batch.

Do not add inspection sample failures to production rejected quantities or silently use one as a substitute for the other.

Affected-unit counts aggregated across different defect types may overlap when one unit has multiple defect types. Label such aggregates as **affected-unit counts across findings**, not as unique defective units, unless deduplication by individual unit is explicitly implemented.

## 3. Relationships

- A defect record belongs to one existing quality inspection.
- A defect record references one existing standardized defect type.
- The inspection provides the associated batch; batch master data can then provide product, line, machine, shift, and production date context.
- The actor recording or correcting the record must be derived from the authenticated request, not trusted from a client-supplied user ID.
- Reuse existing tables and foreign keys where they already exist. Do not add duplicate batch/product/line relationships to a defect record if they can be safely derived through its inspection and batch.

## 4. Validation baseline

Antigravity must check existing database constraints and contracts before implementing these rules.

- `occurrence_count` must be a positive integer.
- `affected_unit_count` must be a positive integer and must not exceed the associated inspection's `failed_units` or `sample_size`, whichever is the correct business bound supported by the existing schema and confirmed requirements. If the existing schema provides a different bound, document and justify it rather than silently contradicting it.
- Do not assume `occurrence_count === affected_unit_count`; a single affected unit can have multiple occurrences.
- The inspection and defect type must exist and be eligible for the operation.
- Defect records associated with cancelled inspections should not be newly created.
- If the existing status flow allows findings only while an inspection is in progress, preserve that rule. For a completed inspection, any correction must use the established correction workflow, require a reason, and be restricted to authorized roles.
- Never allow a client to change the inspector identity recorded by the inspection.
- Reject invalid IDs, negative/zero counts, malformed filters, and unsupported pagination with consistent validation errors.

## 5. Audit and correction policy

- Do not expose a normal delete endpoint for historical defect findings.
- Record creation and any permitted correction in `audit_logs` in the same database transaction as the mutation.
- A correction must retain the before-state and after-state, actor, timestamp, request ID, and a non-empty correction reason.
- Failed mutations must not leave orphaned audit events or partially updated defect records.

## 6. Analytics definitions

For a selected filter period:

- **Defect finding count:** `COUNT(defect_records.id)`.
- **Total occurrences:** `SUM(occurrence_count)`.
- **Affected-unit count across findings:** `SUM(affected_unit_count)` with an explicit overlap caveat.
- **Defects by type:** group by defect type and report finding count, occurrence count, and affected-unit count separately.
- **Defects by severity:** group using the canonical severity from the defect type, not a free-text client value.
- **Defects by product/line/machine/shift:** derive through inspection → production batch → master data joins.
- **Trend:** aggregate consistently by day/week/month based on an explicit date filter and documented timestamp (inspection/record date); use the same basis throughout a chart.
- **Pareto:** rank defect types by a named measure (default affected-unit count across findings); show the chosen measure in labels/tooltips. Do not label it unique defective units.

Analytics must apply the same tenant/role/data visibility scope as the source records if such scope is introduced. In the current single-organization application, enforce authorization consistently with existing authenticated routes.

## 7. Out of scope for Phase 7

- CAPA creation and lifecycle management.
- ML prediction, automated root-cause claims, or AI-generated recommendations.
- Statistical control charts and anomaly-detection claims.
- Notifications or external integrations.
- Changes to production batch disposition quantities from inspection defect records.
