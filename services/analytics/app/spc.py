import math
from typing import List
from .schemas import (
    PChartBaseline,
    PChartCalculationResponse,
    PChartPoint,
    PChartSummary,
    SpcSubgroupInput,
)


def calculate_p_chart(
    subgroups: List[SpcSubgroupInput],
    minimum_required: int = 20,
) -> PChartCalculationResponse:
    """
    Computes a p-chart (fraction nonconforming control chart) for completed inspection subgroups.
    
    Data Semantics:
      - n_i = sample_size > 0
      - x_i = failed_units >= 0 and <= n_i
      - p_i = x_i / n_i (observed fraction nonconforming)
      - p_bar = sum(x_i) / sum(n_i) (pooled weighted proportion)
      - CL_i = p_bar
      - UCL_i = min(1.0, p_bar + 3.0 * sqrt(p_bar * (1 - p_bar) / n_i))
      - LCL_i = max(0.0, p_bar - 3.0 * sqrt(p_bar * (1 - p_bar) / n_i))
    """
    # 1. Validate all subgroup data points
    for idx, sub in enumerate(subgroups):
        if sub.sampleSize <= 0:
            raise ValueError(f"Subgroup at index {idx} ({sub.inspectionNumber}) has non-positive sample size: {sub.sampleSize}")
        if sub.failedUnits < 0:
            raise ValueError(f"Subgroup at index {idx} ({sub.inspectionNumber}) has negative failed units: {sub.failedUnits}")
        if sub.failedUnits > sub.sampleSize:
            raise ValueError(
                f"Subgroup at index {idx} ({sub.inspectionNumber}) has failed units ({sub.failedUnits}) exceeding sample size ({sub.sampleSize})"
            )

    k = len(subgroups)
    total_sample_size = sum(s.sampleSize for s in subgroups)
    total_failed_units = sum(s.failedUnits for s in subgroups)

    # 2. Case: Insufficient Subgroups Guardrail
    if k < minimum_required:
        points: List[PChartPoint] = []
        for s in subgroups:
            p_i = s.failedUnits / s.sampleSize
            points.append(
                PChartPoint(
                    inspectionId=s.id,
                    inspectionNumber=s.inspectionNumber,
                    batchId=s.batchId,
                    batchNumber=s.batchNumber,
                    timestamp=s.timestamp,
                    sampleSize=s.sampleSize,
                    failedUnits=s.failedUnits,
                    observedProportion=p_i,
                    centerLine=None,
                    upperControlLimit=None,
                    lowerControlLimit=None,
                    signal=False,
                    signalReason=None,
                )
            )

        baseline = PChartBaseline(
            subgroupCount=k,
            minimumRequired=minimum_required,
            totalSampleSize=total_sample_size,
            totalFailedUnits=total_failed_units,
            pBar=None,
        )
        summary = PChartSummary(
            signalCount=0,
            upperSignalCount=0,
            lowerSignalCount=0,
            interpretation=(
                f"Insufficient completed inspection subgroups ({k} observed, {minimum_required} required). "
                "At least 20 subgroups are required to establish an initial rational process baseline. Control limits cannot be reliably calculated."
            ),
        )
        warnings = [
            f"Insufficient data: {k} completed inspection subgroups observed; minimum threshold is {minimum_required}."
        ]
        return PChartCalculationResponse(
            status="INSUFFICIENT_DATA",
            baseline=baseline,
            summary=summary,
            points=points,
            warnings=warnings,
        )

    # 3. Calculate pooled proportion p_bar
    if total_sample_size == 0:
        raise ValueError("Total sample size across all subgroups is zero.")

    p_bar = total_failed_units / total_sample_size

    # 4. Case: Degenerate Baseline (p_bar is exactly 0.0 or 1.0)
    if p_bar == 0.0 or p_bar == 1.0:
        points: List[PChartPoint] = []
        for s in subgroups:
            p_i = s.failedUnits / s.sampleSize
            points.append(
                PChartPoint(
                    inspectionId=s.id,
                    inspectionNumber=s.inspectionNumber,
                    batchId=s.batchId,
                    batchNumber=s.batchNumber,
                    timestamp=s.timestamp,
                    sampleSize=s.sampleSize,
                    failedUnits=s.failedUnits,
                    observedProportion=p_i,
                    centerLine=p_bar,
                    upperControlLimit=None,
                    lowerControlLimit=None,
                    signal=False,
                    signalReason=None,
                )
            )

        baseline = PChartBaseline(
            subgroupCount=k,
            minimumRequired=minimum_required,
            totalSampleSize=total_sample_size,
            totalFailedUnits=total_failed_units,
            pBar=p_bar,
        )
        condition_desc = "zero failures recorded across all subgroups" if p_bar == 0.0 else "100% failures recorded across all subgroups"
        summary = PChartSummary(
            signalCount=0,
            upperSignalCount=0,
            lowerSignalCount=0,
            interpretation=(
                f"Degenerate process baseline detected (pooled fraction defective is {p_bar:.4f}, {condition_desc}). "
                "Because standard error collapses to zero, conventional 3-sigma control limits cannot be presented as a trustworthy process baseline."
            ),
        )
        warnings = [
            f"Degenerate baseline: pooled fraction defective is {p_bar}. Standard error is 0; conventional 3-sigma control limits collapse."
        ]
        return PChartCalculationResponse(
            status="DEGENERATE_BASELINE",
            baseline=baseline,
            summary=summary,
            points=points,
            warnings=warnings,
        )

    # 5. Normal READY State: Compute Variable Limits per Subgroup
    points: List[PChartPoint] = []
    upper_signals = 0
    lower_signals = 0

    for s in subgroups:
        p_i = s.failedUnits / s.sampleSize
        se_i = math.sqrt(p_bar * (1.0 - p_bar) / s.sampleSize)
        ucl_i = min(1.0, p_bar + 3.0 * se_i)
        lcl_i = max(0.0, p_bar - 3.0 * se_i)

        signal = False
        signal_reason = None

        # Signal evaluation uses unrounded raw values
        if p_i > ucl_i:
            signal = True
            signal_reason = "ABOVE_UCL"
            upper_signals += 1
        elif p_i < lcl_i:
            signal = True
            signal_reason = "BELOW_LCL"
            lower_signals += 1

        points.append(
            PChartPoint(
                inspectionId=s.id,
                inspectionNumber=s.inspectionNumber,
                batchId=s.batchId,
                batchNumber=s.batchNumber,
                timestamp=s.timestamp,
                sampleSize=s.sampleSize,
                failedUnits=s.failedUnits,
                observedProportion=p_i,
                centerLine=p_bar,
                upperControlLimit=ucl_i,
                lowerControlLimit=lcl_i,
                signal=signal,
                signalReason=signal_reason,
            )
        )

    total_signals = upper_signals + lower_signals

    if total_signals == 0:
        interpretation = (
            f"All {k} completed inspection subgroups fall within calculated 3-sigma statistical control limits. "
            f"The pooled failure proportion is {p_bar:.4f} ({p_bar * 100:.2f}%). Historical process variation is consistent with common-cause variation."
        )
    else:
        interpretation = (
            f"{total_signals} of {k} subgroup(s) exhibited failure proportions outside 3-sigma statistical control limits "
            f"({upper_signals} above UCL, {lower_signals} below LCL). This indicates a statistical signal warranting engineering "
            "investigation into potential assignable causes. Note: Control limits describe process variation; they are not specification or compliance limits."
        )

    baseline = PChartBaseline(
        subgroupCount=k,
        minimumRequired=minimum_required,
        totalSampleSize=total_sample_size,
        totalFailedUnits=total_failed_units,
        pBar=p_bar,
    )
    summary = PChartSummary(
        signalCount=total_signals,
        upperSignalCount=upper_signals,
        lowerSignalCount=lower_signals,
        interpretation=interpretation,
    )

    return PChartCalculationResponse(
        status="READY",
        baseline=baseline,
        summary=summary,
        points=points,
        warnings=[],
    )
