from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_serializer,
    field_validator,
)

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class WorkoutSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    weight: Decimal = Field(ge=0, le=1000, decimal_places=1, allow_inf_nan=False)
    reps: int = Field(ge=1, le=1000, strict=True)

    @field_serializer("weight")
    def serialize_weight(self, weight: Decimal) -> float:
        return float(weight)


class Exercise(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    sets: list[WorkoutSet] = Field(min_length=1, max_length=30)


class WorkoutInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    performed_on: date
    group_id: UUID | None = None
    exercises: list[Exercise] = Field(min_length=1, max_length=20)

    @field_validator("performed_on")
    @classmethod
    def valid_date(cls, value: date) -> date:
        today = datetime.now(ZoneInfo("Asia/Tokyo")).date()
        if not date(2000, 1, 1) <= value <= today:
            raise ValueError("記録日は2000年1月1日から今日までにしてください")
        return value
