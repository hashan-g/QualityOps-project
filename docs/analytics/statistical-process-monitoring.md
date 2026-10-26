# Statistical Process Monitoring — QualityOps Phase 9

## Purpose

Use completed quality inspections as rational subgroups to display the observed fraction of failed sample units over time. The first supported chart is a p-chart for proportions with possibly varying sample sizes.

This is decision support. It does not establish root cause, certify compliance, or replace a trained quality professional's review.

## Source records and semantics

For each eligible completed inspection `i`:

- `n_i`: `quality_inspections.sample_size`, a positive count of inspected sample units.
- `x_i`: `quality_inspections.failed_units`, with `0 <= x_i <= n_i`.
- `p_i = x_i / n_i`: observed failed proportion for that inspection.

Use only completed, valid inspections matching selected product, production line and bounded period. Optionally split/filter by shift and inspection stage where the current schema supports them. Do not combine visibly different production processes into one chart by default.

Do not substitute:

- defect `occurrence_count` (number of defect instances),
- `affected_unit_count` across defect findings, or
- production batch rejected/scrap quantities

for failed units in the inspected sample. These measures answer different questions.

## Formula

Pooled average fraction defective:

`p_bar = sum(x_i) / sum(n_i)`

For each subgroup `i`:

- Center line: `CL_i = p_bar`
- Standard error: `SE_i = sqrt(p_bar * (1 - p_bar) / n_i)`
- Upper control limit: `UCL_i = min(1, p_bar + 3 * SE_i)`
- Lower control limit: `LCL_i = max(0, p_bar - 3 * SE_i)`

Signal if the unrounded observed proportion is greater than `UCL_i` or less than `LCL_i`. Because a p-chart is a proportion chart, limits vary by subgroup sample size.

Use unrounded values for signal detection. Round only for display.

## Data sufficiency

Use a documented/configurable default minimum of 20 eligible subgroups before presenting the chart as `READY`. This is an operational guardrail for the portfolio implementation, not a universal statistical law or formal certification requirement. When insufficient, return the available count and explain that more completed inspections are needed.

If the pooled baseline is exactly zero or one, the conventional p-chart limits collapse to a degenerate baseline. Return a `DEGENERATE_BASELINE` warning or equivalent and do not present those limits as evidence of a stable process.

Validate positive sample sizes and `0 <= failed_units <= sample_size`. Invalid data should produce a clear error or be excluded with a transparent, countable data-quality warning; never silently reinterpret it.

## Interpretation

- One point beyond a control limit is a signal to investigate assignable causes.
- A signal is not itself proof that the process is defective or that specifications were violated.
- Statistical control limits describe observed process behavior. Product/customer specification limits are separate and must not be represented by UCL/LCL.
- Do not state that a corrective action caused improvement solely because rates changed afterward. Show the before/after periods and sample counts, and qualify the interpretation.

## Version 1 exclusions

- No automatic machine stops or production blocking.
- No predictive ML/AI claims.
- No automatic root-cause attribution.
- No additional Western Electric/Nelson run rules unless separately specified, named and tested.
- No mixing products/lines into one chart without a documented rationale.

## Expected point fields

Each chart point should expose a timestamp, inspection reference, batch reference, sample size, failed units, observed proportion, center line, UCL, LCL and signal boolean/reason. The response should include selected filters, eligible subgroup count, threshold, status and any data-quality warnings.
