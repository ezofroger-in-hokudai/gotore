from datetime import date
from uuid import UUID

from app.domain.exercise_catalog import BodyPartSelection


class ExerciseOptionResponse(BodyPartSelection):
    id: UUID
    name: str
    revision: int
    last_performed_on: date | None = None
