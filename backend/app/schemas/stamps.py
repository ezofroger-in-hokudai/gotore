from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

StampKind = Literal[
    "clap", "fire", "muscle", "eyes",
    "encourage", "push", "bad", "amazing", "praise", "tengu",
]


class StampItem(BaseModel):
    id: UUID
    workout_id: UUID
    group_id: UUID
    group_name: str
    sender_id: UUID
    display_name: str
    kind: StampKind
    created_at: datetime
    performed_on: date
    exercise: str
    mine: bool
    read: bool
    announced: bool


class StampTarget(BaseModel):
    group_name: str
    performed_on: date


class StampSummary(BaseModel):
    counts: dict[StampKind, int] = Field(default_factory=dict)
    mine: list[StampKind]
    can_send: bool


class StampBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workout_ids: list[UUID] = Field(min_length=1, max_length=50)


class StampList(BaseModel):
    counts: dict[StampKind, int] = Field(default_factory=dict)
    target: StampTarget | None = None
    items: list[StampItem]
    total: int
    people: int
    unread: int
    mine: list[StampKind]
    can_send: bool = False
    has_more: bool


class StampSeen(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ids: list[UUID] = Field(min_length=1, max_length=100)
    read: bool = False
