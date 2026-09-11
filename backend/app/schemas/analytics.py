from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.domain.analytics import Period


class Window(BaseModel):
    period: Period
    offset: int
    start: date
    end: date
    previous_start: date | None
    previous_end: date | None
    can_previous: bool


class Totals(BaseModel):
    sets: int
    volume: float
    days: int
    people: int
    weight: float | None
    rm: float | None


class Point(Totals):
    start: date
    end: date


class Rank(BaseModel):
    user_id: UUID
    display_name: str
    value: float | None
    rank: int | None
    status: Literal["recorded", "first", "zero_baseline"]


class AnalyticsResponse(BaseModel):
    window: Window
    exercise: str | None
    exercises: list[str]
    totals: Totals
    previous_totals: Totals | None
    series: dict[Literal["day", "week", "month"], list[Point]]
    rankings: dict[str, list[Rank]]
