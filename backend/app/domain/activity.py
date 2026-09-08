import re
from datetime import date, datetime
from zoneinfo import ZoneInfo


def today_in_japan() -> date:
    return datetime.now(ZoneInfo("Asia/Tokyo")).date()


def validate_activity_date(value: date) -> None:
    if not date(2000, 1, 1) <= value <= today_in_japan():
        raise ValueError("日付は2000年1月1日から今日までを指定してください")


def month_bounds(value: str) -> tuple[date, date]:
    if not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", value):
        raise ValueError("月はYYYY-MM形式で指定してください")
    start = date.fromisoformat(f"{value}-01")
    validate_activity_date(start)
    end = date(start.year + 1, 1, 1) if start.month == 12 else date(start.year, start.month + 1, 1)
    return start, end
