from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.domain.workout import Exercise
from app.schemas.score import ScoreSummary


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


class GroupInviteToken(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: Annotated[str, StringConstraints(strip_whitespace=True, min_length=40, max_length=100)]


class GroupOwnerTransfer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    member_id: UUID
    expected_joined_at: datetime


class GroupInviteResponse(BaseModel):
    token: str
    expires_at: datetime


class GroupInviteMember(BaseModel):
    id: UUID
    display_name: str
    role: str


class GroupInvitePreviewResponse(BaseModel):
    id: UUID
    name: str
    member_count: int
    already_member: bool
    members: list[GroupInviteMember]


class GroupResponse(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    invite_code: str
    invite_expires_at: datetime
    created_at: datetime


class MemberResponse(BaseModel):
    id: UUID
    display_name: str
    avatar_version: UUID | None = None
    joined_at: datetime
    last_activity_at: datetime | None = None


class GroupDetail(GroupResponse):
    members: list[MemberResponse]


class RecordBestSet(BaseModel):
    exercise_index: int
    set_index: int
    weight: bool
    rm: bool


class WorkoutResponse(BaseModel):
    best_sets: list[RecordBestSet] = Field(default_factory=list)
    score: ScoreSummary | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    auto_ended: bool = False
    shared_group_ids: list[UUID] = Field(default_factory=list)
    revision: int
    id: UUID
    user_id: UUID
    display_name: str
    avatar_version: UUID | None = None
    group_id: UUID | None
    performed_on: date
    exercises: list[Exercise]
    created_at: datetime


class WorkoutMemoResponse(BaseModel):
    content: str
    revision: int
