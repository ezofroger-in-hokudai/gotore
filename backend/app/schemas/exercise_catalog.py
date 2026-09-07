from uuid import UUID

from pydantic import BaseModel


class ExerciseOptionResponse(BaseModel):
    id: UUID
    name: str
