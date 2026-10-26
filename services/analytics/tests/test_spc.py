import math
import pytest
from app.schemas import SpcSubgroupInput
from app.spc import calculate_p_chart


def make_subgroup(
    idx: int,
    sample_size: int = 100,
    failed_units: int = 5,
    timestamp: str = "2026-01-01T08:00:00Z",
) -> SpcSubgroupInput:
    return SpcSubgroupInput(
        id=f"00000000-0000-0000-0000-{idx:012d}",
        inspectionNumber=f"INSP-2026-{idx:04d}",
        batchId=f"11111111-1111-1111-1111-{idx:012d}",
        batchNumber=f"BATCH-{idx:03d}",
        timestamp=timestamp,
        sampleSize=sample_size,
        failedUnits=failed_units,
    )


class TestPChartCalculations:
    def test_pooled_average_differs_from_unweighted_average_when_sample_sizes_vary(self):
        """
        Verify that p_bar = sum(failed) / sum(sample_size) and does not incorrectly
        average subgroup failure percentages equally when weights differ.
        """
        subgroups = [
            make_subgroup(1, sample_size=1000, failed_units=10),  # 1%
            make_subgroup(2, sample_size=50, failed_units=10),    # 20%
        ]
        # Extend to 20 subgroups so we reach minimum threshold
        for i in range(3, 21):
            subgroups.append(make_subgroup(i, sample_size=100, failed_units=5))  # 5%

        total_sample = 1000 + 50 + (18 * 100)  # 2850
        total_failed = 10 + 10 + (18 * 5)     # 110
        expected_p_bar = 110 / 2850           # ~0.038596

        unweighted_mean_p = (0.01 + 0.20 + (18 * 0.05)) / 20  # 0.0555

        res = calculate_p_chart(subgroups, minimum_required=20)
        assert res.status == "READY"
        assert res.baseline.pBar is not None
        assert math.isclose(res.baseline.pBar, expected_p_bar, rel_tol=1e-6)
        assert not math.isclose(res.baseline.pBar, unweighted_mean_p, rel_tol=1e-3)

    def test_varying_subgroup_sample_sizes_produce_varying_control_limits(self):
        """
        Smaller subgroups have higher standard errors, leading to wider 3-sigma limits.
        Larger subgroups have narrower limits.
        """
        subgroups = [
            make_subgroup(1, sample_size=50, failed_units=2),   # smaller n
            make_subgroup(2, sample_size=500, failed_units=20), # larger n
        ]
        for i in range(3, 21):
            subgroups.append(make_subgroup(i, sample_size=100, failed_units=4))

        res = calculate_p_chart(subgroups, minimum_required=20)
        assert res.status == "READY"
        p_bar = res.baseline.pBar

        point_small = res.points[0]  # n=50
        point_large = res.points[1]  # n=500

        # UCL_small should be greater than UCL_large
        assert point_small.upperControlLimit > point_large.upperControlLimit
        # Width of small subgroup limits > width of large subgroup limits
        width_small = point_small.upperControlLimit - point_small.lowerControlLimit
        width_large = point_large.upperControlLimit - point_large.lowerControlLimit
        assert width_small > width_large

    def test_ucl_and_lcl_are_clipped_to_zero_and_one(self):
        """
        LCL cannot be less than 0.0; UCL cannot exceed 1.0.
        """
        # Small sample size and small p_bar causes p_bar - 3*SE < 0
        subgroups = [make_subgroup(i, sample_size=30, failed_units=1) for i in range(1, 21)]
        res = calculate_p_chart(subgroups, minimum_required=20)
        assert res.status == "READY"

        for pt in res.points:
            assert pt.lowerControlLimit >= 0.0
            assert pt.upperControlLimit <= 1.0

    def test_signal_detection_uses_unrounded_raw_proportions(self):
        """
        Verifies that an observed proportion above UCL triggers signal.
        """
        subgroups = [make_subgroup(i, sample_size=100, failed_units=4) for i in range(1, 20)]
        subgroups.append(make_subgroup(20, sample_size=100, failed_units=15))

        res = calculate_p_chart(subgroups, minimum_required=20)
        assert res.status == "READY"
        assert res.summary.signalCount == 1
        assert res.summary.upperSignalCount == 1
        assert res.summary.lowerSignalCount == 0

        flagged_point = res.points[19]
        assert flagged_point.signal is True
        assert flagged_point.signalReason == "ABOVE_UCL"

    def test_insufficient_subgroups_returns_insufficient_data_status(self):
        """
        Fewer than minimumRequired subgroups returns INSUFFICIENT_DATA and no fabricated limits.
        """
        subgroups = [make_subgroup(i, sample_size=100, failed_units=3) for i in range(1, 19)]  # 18 subgroups
        res = calculate_p_chart(subgroups, minimum_required=20)

        assert res.status == "INSUFFICIENT_DATA"
        assert res.baseline.pBar is None
        assert res.baseline.subgroupCount == 18
        assert res.baseline.minimumRequired == 20
        assert len(res.points) == 18

        for pt in res.points:
            assert pt.centerLine is None
            assert pt.upperControlLimit is None
            assert pt.lowerControlLimit is None
            assert pt.signal is False

    def test_zero_defect_baseline_returns_degenerate_baseline(self):
        """
        When all subgroups have 0 defects, p_bar = 0 and limits collapse.
        """
        subgroups = [make_subgroup(i, sample_size=100, failed_units=0) for i in range(1, 25)]
        res = calculate_p_chart(subgroups, minimum_required=20)

        assert res.status == "DEGENERATE_BASELINE"
        assert res.baseline.pBar == 0.0
        assert len(res.warnings) > 0
        assert "Degenerate" in res.summary.interpretation

        for pt in res.points:
            assert pt.upperControlLimit is None
            assert pt.lowerControlLimit is None
            assert pt.signal is False

    def test_all_defect_baseline_returns_degenerate_baseline(self):
        """
        When all subgroups have 100% defects, p_bar = 1.0 and limits collapse.
        """
        subgroups = [make_subgroup(i, sample_size=50, failed_units=50) for i in range(1, 25)]
        res = calculate_p_chart(subgroups, minimum_required=20)

        assert res.status == "DEGENERATE_BASELINE"
        assert res.baseline.pBar == 1.0

    def test_rejects_negative_failed_units(self):
        # SpcSubgroupInput constructed bypassing pydantic validation or via calculate_p_chart validation
        sub = SpcSubgroupInput.model_construct(
            id="00000000-0000-0000-0000-000000000001",
            inspectionNumber="INSP-01",
            batchId="11111111-1111-1111-1111-000000000001",
            batchNumber="B1",
            timestamp="2026-01-01T00:00:00Z",
            sampleSize=100,
            failedUnits=-5,
        )
        with pytest.raises(ValueError, match="negative failed units"):
            calculate_p_chart([sub])

    def test_rejects_failed_units_exceeding_sample_size(self):
        sub = SpcSubgroupInput.model_construct(
            id="00000000-0000-0000-0000-000000000001",
            inspectionNumber="INSP-01",
            batchId="11111111-1111-1111-1111-000000000001",
            batchNumber="B1",
            timestamp="2026-01-01T00:00:00Z",
            sampleSize=50,
            failedUnits=51,
        )
        with pytest.raises(ValueError, match="exceeding sample size"):
            calculate_p_chart([sub])

    def test_rejects_non_positive_sample_size(self):
        sub = SpcSubgroupInput.model_construct(
            id="00000000-0000-0000-0000-000000000001",
            inspectionNumber="INSP-01",
            batchId="11111111-1111-1111-1111-000000000001",
            batchNumber="B1",
            timestamp="2026-01-01T00:00:00Z",
            sampleSize=0,
            failedUnits=0,
        )
        with pytest.raises(ValueError, match="non-positive sample size"):
            calculate_p_chart([sub])
