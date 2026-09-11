from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

Period = Literal["week", "month", "quarter", "year", "all"]
EARLIEST = date(2000, 1, 1)


@dataclass(frozen=True)
class AnalyticsWindow:
    period: Period
    offset: int
    start: date
    end: date
    previous_start: date | None
    previous_end: date | None
    can_previous: bool


def shift_month(value: date, months: int) -> date:
    index = value.year * 12 + value.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def analytics_window(period: Period, offset: int, today: date) -> AnalyticsWindow:
    if offset < 0 or (period == "all" and offset):
        raise ValueError("期間を正しく指定してください")
    if period == "all":
        return AnalyticsWindow(period, 0, EARLIEST, today, None, None, False)
    if period == "week":
        start = today - timedelta(days=today.weekday() + 7 * offset)
        full_end = start + timedelta(days=6)
        previous_start = start - timedelta(days=7)
    else:
        months = {"month": 1, "quarter": 3, "year": 12}[period]
        start = shift_month(today.replace(day=1), -(months - 1) - months * offset)
        full_end = shift_month(start, months) - timedelta(days=1)
        previous_start = shift_month(start, -months)
    if full_end < EARLIEST:
        raise ValueError("2000年以降の期間を指定してください")
    end = min(today, full_end)
    # 完了期間は前の完了期間、進行中は同じ経過日数で比べる。
    previous_end = start - timedelta(days=1)
    if end < full_end:
        previous_end = min(previous_end, previous_start + (end - start))
    return AnalyticsWindow(
        period,
        offset,
        max(start, EARLIEST),
        end,
        max(previous_start, EARLIEST) if previous_end >= EARLIEST else None,
        previous_end if previous_end >= EARLIEST else None,
        start > EARLIEST,
    )


def rounded(value) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def totals(rows: list[dict], strength: bool) -> dict:
    def maximum(key):
        values = [row[key] for row in rows if row[key] is not None]
        return rounded(max(values)) if strength and values else None

    return {
        "sets": sum(row["sets"] for row in rows),
        "volume": rounded(sum(Decimal(str(row["volume"])) for row in rows)),
        "days": len({row["date"] for row in rows}),
        "people": len({row["user_id"] for row in rows}),
        "weight": maximum("weight"),
        "rm": maximum("rm"),
    }


def bucket_start(value: date, grain: str) -> date:
    if grain == "week":
        return value - timedelta(days=value.weekday())
    return value.replace(day=1) if grain == "month" else value


def next_bucket(value: date, grain: str) -> date:
    return (
        shift_month(value, 1)
        if grain == "month"
        else value + timedelta(days=7 if grain == "week" else 1)
    )


def series(rows: list[dict], start: date, end: date, strength: bool) -> dict:
    result = {}
    for grain, limit in [("day", 366), ("week", 1092), ("month", None)]:
        if limit and (end - start).days + 1 > limit:
            continue
        if (
            grain == "week"
            and (bucket_start(end, grain) - bucket_start(start, grain)).days // 7 + 1 > 156
        ):
            continue
        buckets = defaultdict(list)
        for row in rows:
            buckets[bucket_start(row["date"], grain)].append(row)
        points = []
        cursor = bucket_start(start, grain)
        while cursor <= end:
            following = next_bucket(cursor, grain)
            points.append(
                {
                    "start": max(cursor, start),
                    "end": min(following - timedelta(days=1), end),
                    **totals(buckets[cursor], strength),
                }
            )
            cursor = following
        result[grain] = points
    return result


def rankings(current: list[dict], previous: list[dict], strength: bool, compare: bool) -> dict:
    users = defaultdict(list)
    before = defaultdict(list)
    for row in current:
        users[row["user_id"]].append(row)
    for row in previous:
        before[row["user_id"]].append(row)
    metrics = ["sets", "volume", "days"]
    if strength:
        metrics += ["weight", "rm"]
        if compare:
            metrics += ["weight_growth", "weight_percent", "rm_growth", "rm_percent"]
    result = {metric: [] for metric in metrics}
    for user_id, rows in users.items():
        values, baseline = totals(rows, strength), totals(before[user_id], strength)
        for metric in metrics:
            key = metric.split("_")[0]
            value, status = values[key], "recorded"
            if value is None:
                continue
            if "_" in metric:
                if baseline[key] is None:
                    value, status = None, "first"
                elif metric.endswith("percent") and baseline[key] == 0:
                    value, status = None, "zero_baseline"
                else:
                    value = Decimal(str(value)) - Decimal(str(baseline[key]))
                    if metric.endswith("percent"):
                        value = value / Decimal(str(baseline[key])) * 100
                    value = rounded(value)
            result[metric].append(
                {
                    "user_id": str(user_id),
                    "display_name": rows[0]["display_name"],
                    "value": value,
                    "status": status,
                    "rank": None,
                }
            )
    for entries in result.values():
        entries.sort(key=lambda row: (row["value"] is None, -(row["value"] or 0), row["user_id"]))
        last_value, last_rank = None, None
        for index, entry in enumerate(entries):
            if entry["value"] is not None:
                if entry["value"] != last_value:
                    last_rank = index + 1
                entry["rank"] = last_rank
                last_value = entry["value"]
    return result


def build_analytics(
    window: AnalyticsWindow,
    rows: list[dict],
    exercises: list[str],
    exercise: str | None,
    group: bool,
) -> dict:
    current = [row for row in rows if window.start <= row["date"] <= window.end]
    previous = [
        row
        for row in rows
        if window.previous_start is not None
        and window.previous_start <= row["date"] <= window.previous_end
    ]
    strength = exercise is not None
    # 全期間の空白26年を描画せず、最初の対象記録から系列を作る。
    start = (
        min((row["date"] for row in current), default=window.end)
        if window.period == "all"
        else window.start
    )
    return {
        "window": asdict(window),
        "exercise": exercise,
        "exercises": exercises,
        "totals": totals(current, strength),
        "previous_totals": totals(previous, strength) if window.previous_start else None,
        "series": series(current, start, window.end, strength),
        "rankings": rankings(current, previous, strength, window.previous_start is not None)
        if group
        else {},
    }
