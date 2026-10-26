# QualityOps Phase 9 — Metric Definitions

This document distinguishes the measures used by QualityOps. Keep these semantics consistent across SQL, contracts, API responses, charts and documentation.

| Measure                            | Definition                                                           | Source                               | Must not be confused with                                    |
| ---------------------------------- | -------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| Inspection sample size             | Number of units inspected in one inspection                          | `quality_inspections.sample_size`    | Total batch production quantity                              |
| Inspection failed units            | Units in that inspected sample that failed                           | `quality_inspections.failed_units`   | Defect instance count                                        |
| Inspection failure proportion      | `failed_units / sample_size` for one completed inspection            | Inspection record                    | Scrap rate for the whole batch                               |
| Pooled baseline fraction (`p_bar`) | Sum of eligible failed units divided by sum of eligible sample sizes | Filtered completed inspections       | Unweighted average of inspection percentages                 |
| Defect occurrences                 | Count of defect instances recorded for a defect finding              | `defect_records.occurrence_count`    | Unique physical units affected                               |
| Affected units                     | Physical units affected by a defect type within a finding            | `defect_records.affected_unit_count` | Sum that necessarily equals unique units across defect types |
| Production accepted/scrap/rework   | Batch disposition counts under production lifecycle rules            | `production_batches`                 | Inspection-sample outcomes                                   |
| P-chart signal                     | An inspection proportion outside the calculated control limits       | Statistical calculation              | Proof of root cause or specification failure                 |

## Data aggregation rules

1. Use completed inspections only for the p-chart baseline.
2. Filter to one product and one production line by default; optional shift/stage filters can narrow the process further.
3. Require a bounded date range and deterministic chronological order.
4. Use raw integer counts for the pooled baseline; do not average subgroup percentages unweighted when sample sizes differ.
5. Do not update production batch disposition quantities from inspection or analytics code.
6. Explain exclusions and insufficient data in the response/UI.
