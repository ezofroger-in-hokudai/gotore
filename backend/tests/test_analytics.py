from datetime import date

import pytest

from app.domain.analytics import analytics_window, build_analytics


def test_calendar_windows_and_partial_comparison():
    window = analytics_window("month", 0, date(2026, 9, 11))
    assert window.start == date(2026, 9, 1)
    assert window.end == date(2026, 9, 11)
    assert window.previous_start == date(2026, 8, 1)
    assert window.previous_end == date(2026, 8, 11)
    leap = analytics_window("month", 1, date(2024, 3, 31))
    assert leap.start == date(2024, 2, 1)
    assert leap.end == date(2024, 2, 29)
    assert leap.previous_end == date(2024, 1, 31)
    week = analytics_window("week", 0, date(2026, 1, 1))
    assert week.start == date(2025, 12, 29)
    assert week.previous_end == date(2025, 12, 25)
    assert analytics_window("all", 0, date(2026, 9, 11)).previous_start is None
    with pytest.raises(ValueError):
        analytics_window("all", 1, date(2026, 9, 11))
    with pytest.raises(ValueError):
        analytics_window("year", 100, date(2026, 9, 11))


def row(day, user="a", sets=1, volume=100, weight=50, rm=60):
    return {
        "date": date.fromisoformat(day),
        "user_id": user,
        "display_name": user,
        "sets": sets,
        "volume": volume,
        "weight": weight,
        "rm": rm,
    }


def test_totals_ties_growth_gaps_and_distinct_activity():
    result = build_analytics(
        analytics_window("month", 0, date(2026, 9, 11)),
        [
            row("2026-09-01"),
            row("2026-09-01", "b"),
            row("2026-09-02"),
            row("2026-09-02", "b"),
            row("2026-09-03", "c", weight=0, rm=None),
            row("2026-08-01", weight=40),
            row("2026-08-01", "b", weight=0),
        ],
        ["ベンチ"],
        "ベンチ",
        True,
    )
    assert result["totals"]["sets"] == 5
    assert result["totals"]["days"] == 3
    assert result["totals"]["people"] == 3
    assert result["series"]["day"][0]["people"] == 2
    assert result["series"]["day"][3]["weight"] is None
    assert result["series"]["day"][3]["volume"] == 0
    assert [r["rank"] for r in result["rankings"]["sets"]] == [1, 1, 3]
    assert result["rankings"]["weight_growth"][0]["user_id"] == "b"
    percent = result["rankings"]["weight_percent"]
    assert percent[0]["value"] == 25
    assert percent[1]["rank"] is None
    assert percent[2]["status"] == "first"


def test_all_exercises_hide_strength_and_long_ranges_bound_series():
    result = build_analytics(
        analytics_window("all", 0, date(2026, 9, 11)),
        [row("2000-01-01"), row("2026-09-11")],
        ["ベンチ"],
        None,
        False,
    )
    assert result["totals"]["weight"] is None
    assert result["series"].keys() == {"month"}
    assert len(result["series"]["month"]) <= 321
    assert result["previous_totals"] is None
    assert result["rankings"] == {}


def test_week_series_limit_includes_partial_weeks():
    result = build_analytics(
        analytics_window("all", 0, date(2026, 9, 11)),
        [row("2023-09-16"), row("2026-09-11")],
        [],
        None,
        False,
    )
    assert len(result["series"].get("week", [])) <= 156
