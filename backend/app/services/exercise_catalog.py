from uuid import UUID

from app.domain.exercise_catalog import ExerciseOptionInput, ExerciseOptionUpdate
from app.infrastructure.exercise_catalog import ExerciseCatalogRepository


class ExerciseCatalogService:
    def __init__(self, repository: ExerciseCatalogRepository, user_id: UUID):
        self.repository = repository
        self.user_id = user_id
        repository.initialize(user_id)

    def options(self):
        return self.repository.options(self.user_id)

    def add(self, data: ExerciseOptionInput):
        return self.repository.add(
            self.user_id, data.name, data.primary_body_part, data.secondary_body_parts
        )

    def update(self, option_id: UUID, data: ExerciseOptionUpdate):
        return self.repository.update(self.user_id, option_id, data)

    def delete(self, option_id: UUID):
        self.repository.delete(self.user_id, option_id)
