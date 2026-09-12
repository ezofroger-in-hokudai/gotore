from datetime import date, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.domain.score import (
    ScoreWeights,
    consistency_score,
    goal_score,
    intensity_score,
    summarize_exercises,
    total_score,
    volume_score,
)


@pytest.mark.parametrize("volume,expected", [(6000, 100), (5700, 100), (0, 0)])
def test_volume_full_boundary_and_zero_performance(volume, expected):
    assert volume_score(Decimal(volume), Decimal(6000)) == expected


def test_volume_missing_baseline_and_precision():
    assert volume_score(Decimal(5400), Decimal(6000)) == Decimal(1800) / 19
    assert volume_score(Decimal(100), None) is None
    assert volume_score(Decimal(0), Decimal(0)) is None


def test_same_name_rows_merge_and_preserve_rm_rules():
    stats = summarize_exercises(
        [
            {"name": " ベンチ ", "sets": [{"weight": 60, "reps": 10}]},
            {"name": "ベンチ", "sets": [{"weight": 100, "reps": 1}]},
            {"name": "自重", "sets": [{"weight": 0, "reps": 8}]},
            {"name": "高回数", "sets": [{"weight": 20, "reps": 11}]},
        ]
    )
    assert stats["ベンチ"].volume == 700
    assert stats["ベンチ"].sets == 2
    assert stats["ベンチ"].rm == 100
    assert stats["自重"].rm is None
    assert stats["高回数"].rm is None


def test_intensity_caps_each_exercise_before_average_and_requires_all():
    assert (
        intensity_score(
            {"a": Decimal(190), "b": Decimal("47.5")}, {"a": Decimal(100), "b": Decimal(100)}
        )
        == 75
    )
    assert intensity_score({"a": Decimal(95)}, {"a": Decimal(100)}) == 100
    assert intensity_score({"a": None}, {"a": Decimal(100)}) is None
    assert intensity_score({"a": Decimal(100)}, {"a": None}) is None
    assert intensity_score({"a": Decimal(100)}, {"b": Decimal(100)}) is None
    assert intensity_score({}, {}) is None


@pytest.mark.parametrize(
    "counts,expected", [([2, 2, 2, 2], 100), ([2, 2, 2, 0], 75), ([7, 0, 0, 0], 25)]
)
def test_consistency_rewards_distributed_days(counts, expected):
    today = date(2026, 9, 12)
    days = [
        today - timedelta(days=7 * block + offset)
        for block, count in enumerate(counts)
        for offset in range(count)
    ]
    assert consistency_score(today, today - timedelta(days=40), days + days) == expected


def test_consistency_complete_windows_only_and_excludes_outside_dates():
    today = date(2026, 9, 12)
    assert consistency_score(today, today - timedelta(days=5), [today]) is None
    assert consistency_score(today, today - timedelta(days=6), [today]) == 50
    assert (
        consistency_score(today, today - timedelta(days=12), [today, today - timedelta(days=7)])
        == 50
    )
    assert (
        consistency_score(today, today - timedelta(days=13), [today, today - timedelta(days=7)])
        == 50
    )
    assert consistency_score(today, None, []) is None
    assert (
        consistency_score(
            today,
            today - timedelta(days=30),
            [today + timedelta(days=1), today - timedelta(days=28)],
        )
        == 0
    )


def test_goal_judgments_and_incomplete_criteria():
    assert goal_score([1, 0.5]) == 75
    assert goal_score([0, 0]) == 0
    assert goal_score([1, None]) is None
    for values in ([1], [1, 0.7], [True, 1], [1] * 5):
        with pytest.raises(ValueError):
            goal_score(values)


def test_total_example_rounds_at_end_and_never_renormalizes():
    components = {
        "c": Decimal(75),
        "i": Decimal(100),
        "v": volume_score(Decimal(5400), Decimal(6000)),
        "g": Decimal(75),
    }
    assert total_score(components, ScoreWeights()) == 88
    assert total_score({**components, "g": None}, ScoreWeights()) is None
    assert total_score({**components, "g": None}, ScoreWeights(c=30, i=20, v=50, g=0)) == 90
    assert total_score(dict.fromkeys(components, Decimal("88.5")), ScoreWeights()) == 89


@pytest.mark.parametrize("weights", [{"c": -1}, {"c": 31}, {"c": True}, {"g": 10.5}])
def test_weights_require_integer_percentages_totaling_100(weights):
    with pytest.raises(ValidationError):
        ScoreWeights(**weights)


def test_initial_benchmark_caps_each_exercise_and_merges_same_names():
    from app.domain.score import apply_initial_benchmark

    exercises = [
        {"name": " ベンチ ", "sets": [{"weight": 60, "reps": 10}] * 3},
        {"name": "ベンチ", "sets": [{"weight": 60, "reps": 30}]},
        {"name": "自重", "sets": [{"weight": 0, "reps": 15}]},
    ]
    values, axes = apply_initial_benchmark(dict.fromkeys(("c", "i", "v", "g")), exercises)
    assert values == {"c": 100, "i": 100, "v": 75, "g": None}
    assert axes == ["c", "i", "v"]
    assert total_score({**values, "g": Decimal(100)}, ScoreWeights()) == 90


def test_initial_benchmark_preserves_comparable_scores_including_zero():
    from app.domain.score import apply_initial_benchmark

    original = {"c": Decimal(0), "i": Decimal(70), "v": Decimal(80), "g": None}
    values, axes = apply_initial_benchmark(original, [{"name": "a", "sets": []}])
    assert values == original
    assert axes == []
    assert apply_initial_benchmark(dict.fromkeys(original), []) == (dict.fromkeys(original), [])


@pytest.mark.parametrize("reps,expected", [(10, Decimal(100) / 3), (30, 100), (60, 100)])
def test_initial_benchmark_uses_total_thirty_reps(reps, expected):
    from app.domain.score import apply_initial_benchmark

    values, _ = apply_initial_benchmark(
        dict.fromkeys(("c", "i", "v", "g")),
        [{"name": "ベンチ", "sets": [{"weight": 60, "reps": reps}]}],
    )
    assert values["v"] == expected
