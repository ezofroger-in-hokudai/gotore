from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.exercise_catalog import ExerciseOptionResponse
from app.schemas.session import ExerciseContext
from app.schemas.training import WorkoutMemoResponse, WorkoutResponse


class RecordSnapshot(BaseModel):
    version: int = 1
    user_id: UUID
    workouts: list[WorkoutResponse]
    options: list[ExerciseOptionResponse]
    contexts: dict[str, ExerciseContext]
    workout_memos: dict[str, WorkoutMemoResponse]
    session_exercise_memos: dict[str, dict[str, WorkoutMemoResponse]]


class WorkoutManifest(BaseModel):
    id: UUID
    revision: int
    names: list[str]
    shared_group_ids: list[UUID]
    has_best: bool


class OptionManifest(BaseModel):
    id: UUID
    name: str
    revision: int


class RecordManifest(BaseModel):
    version: int = Field(ge=1, le=1)
    workouts: list[WorkoutManifest] = Field(max_length=10000)
    options: list[OptionManifest] = Field(max_length=2000)
    contexts: dict[str, int]
    workout_memos: dict[UUID, int]
    session_exercise_memos: dict[UUID, dict[str, int]]
    active_workout_id: UUID | None = None


class RecordChanges(BaseModel):
    version: int = 1
    user_id: UUID
    workouts: list[WorkoutResponse]
    deleted_workout_ids: list[UUID]
    options: list[ExerciseOptionResponse]
    deleted_option_ids: list[UUID]
    contexts: dict[str, ExerciseContext]
    deleted_context_names: list[str]
    workout_memos: dict[str, WorkoutMemoResponse]
    deleted_workout_memo_ids: list[UUID]
    session_exercise_memos: dict[str, dict[str, WorkoutMemoResponse]]
    deleted_session_exercise_memos: dict[str, list[str]]
