from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.domain.workout import Exercise


class GroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class GroupRename(GroupCreate):
    pass


class GroupJoin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invite_code: Annotated[
        str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Fa-f0-9]{12}$")
    ]


class InviteCodeRenew(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_invite_code: Annotated[
        str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Fa-f0-9]{12}$")
    ]


class GroupResponse(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    invite_code: str
    created_at: datetime


class MemberResponse(BaseModel):
    id: UUID
    display_name: str


class GroupDetail(GroupResponse):
    members: list[MemberResponse]


class WorkoutResponse(BaseModel):
    revision: int
    id: UUID
    user_id: UUID
    display_name: str
    group_id: UUID | None
    performed_on: date
    exercises: list[Exercise]
    created_at: datetime
