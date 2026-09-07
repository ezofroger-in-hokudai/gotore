from datetime import date, datetime, timezone

import pytest

from app.domain import activity


def test_month_boundaries_include_leap_day_and_year_change(monkeypatch):
    monkeypatch.setattr(activity, "today_in_japan", lambda: date(2026, 9, 7))
    assert activity.month_bounds("2024-02") == (date(2024, 2, 1), date(2024, 3, 1))
    assert activity.month_bounds("2024-12") == (date(2024, 12, 1), date(2025, 1, 1))
    assert activity.month_bounds("2000-01")[0] == date(2000, 1, 1)
    assert activity.month_bounds("2026-09")[0] == date(2026, 9, 1)
    with pytest.raises(ValueError):
        activity.month_bounds("2026-10")
    with pytest.raises(ValueError):
        activity.validate_activity_date(date(2026, 9, 8))
    activity.validate_activity_date(date(2026, 9, 7))


def test_today_uses_japan_midnight(monkeypatch):
    class FixedDateTime:
        @staticmethod
        def now(tz):
            return datetime(2026, 9, 7, 15, 0, tzinfo=timezone.utc).astimezone(tz)

    monkeypatch.setattr(activity, "datetime", FixedDateTime)
    assert activity.today_in_japan() == date(2026, 9, 8)
