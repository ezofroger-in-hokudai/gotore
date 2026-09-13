from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.domain.exercise_catalog import BodyPart


class ActivityBodyPart(BaseModel):
    body_part: BodyPart
    volume: float
    set_count: int
    workout_count: int


class ActivityWorkoutGroup(BaseModel):
    body_parts: list[BodyPart]
    workout_count: int


class ActivityDay(BaseModel):
    date: date
    workout_groups: list[ActivityWorkoutGroup] = Field(default_factory=list)
    body_parts: list[ActivityBodyPart] = Field(default_factory=list)
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
