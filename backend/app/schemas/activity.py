from datetime import date
from typing import Literal

from pydantic import BaseModel


class ActivityDay(BaseModel):
    date: date
    score: int | None = None
    set_count: int
    workout_count: int


class MonthlyActivity(BaseModel):
    month: str
    metric: Literal["score"] = "score"
    best_score: int | None = None
    total_sets: int
    workout_count: int
    active_days: int
    days: list[ActivityDay]
