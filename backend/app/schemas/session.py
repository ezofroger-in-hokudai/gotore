from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.workout import WorkoutSet
from app.schemas.score import ScoreSummary
from app.schemas.training import MemberResponse, WorkoutMemoResponse, WorkoutResponse


class SessionResponse(WorkoutResponse):
    started_at: datetime
    best_updated: bool = Field(default=False, validation_alias="feed_best")


class BestSetPosition(BaseModel):
    exercise_index: int
    set_index: int


class SessionBests(BaseModel):
    revision: int
    sets: list[BestSetPosition]


class InvitePreview(BaseModel):
    id: UUID
    name: str
    member_count: int
    already_member: bool


class PreviousSession(BaseModel):
    id: UUID
    performed_on: date
    sets: list[WorkoutSet]


class ExerciseContext(BaseModel):
    best_weight: float | None
    best_rm: float | None
    previous: PreviousSession | None
    memo: WorkoutMemoResponse


class ActivityMember(MemberResponse):
    live: bool
    today: bool
    live_until: datetime | None = None
    avatar_version: UUID | None = None


class FeedItem(BaseModel):
    score: ScoreSummary | None = None
    workout_id: UUID
    user_id: UUID
    display_name: str
    exercise: str
    weight: float
    reps: int
    estimated_rm: float | None
    updated_at: datetime
    best: bool


class GroupSummary(BaseModel):
    observed_at: datetime
    group_id: UUID
    member_count: int
    live_count: int
    today_count: int
    members: list[ActivityMember]


class GroupActivity(GroupSummary):
    feed: list[FeedItem]
