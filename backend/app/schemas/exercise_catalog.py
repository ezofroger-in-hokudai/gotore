from uuid import UUID

from app.domain.exercise_catalog import BodyPartSelection


class ExerciseOptionResponse(BodyPartSelection):
    id: UUID
    name: str
    revision: int
