from uuid import UUID

from app.infrastructure.exercise_catalog import ExerciseCatalogRepository


class ExerciseCatalogService:
    def __init__(self, repository: ExerciseCatalogRepository, user_id: UUID):
        self.repository = repository
        self.user_id = user_id
        repository.initialize(user_id)

    def options(self):
        return self.repository.options(self.user_id)

    def add(self, name: str):
        return self.repository.add(self.user_id, name)

    def delete(self, option_id: UUID):
        self.repository.delete(self.user_id, option_id)
