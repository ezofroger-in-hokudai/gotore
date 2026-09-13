from datetime import date
from typing import Literal

from pydantic import BaseModel


class ActivityDay(BaseModel):
    date: date
    volume: float
    set_count: int
    workout_count: int


class MonthlyActivity(BaseModel):
    month: str
    metric: Literal["volume"] = "volume"
    total_volume: float
    total_sets: int
    workout_count: int
    active_days: int
    days: list[ActivityDay]
