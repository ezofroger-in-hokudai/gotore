from uuid import UUID

from pydantic import BaseModel

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
