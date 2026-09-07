from datetime import datetime
from uuid import UUID

from app.domain.identity import AuthenticatedUser
from app.domain.workout import WorkoutInput
from app.infrastructure.training_repository import TrainingRepository


class TrainingService:
    def __init__(self, repository: TrainingRepository, user: AuthenticatedUser):
        self.repository = repository
        self.user = repository.profile(user)

    def groups(self):
        return self.repository.groups(self.user.id)

    def group(self, group_id: UUID):
        group = self.repository.group(self.user.id, group_id)
        return {**group, "members": self.repository.members(group_id)}

    def create_group(self, name: str):
        return self.repository.create_group(self.user.id, name)

    def join_group(self, invite_code: str):
        return self.repository.join_group(self.user.id, invite_code)

    def rename_group(self, group_id: UUID, name: str):
        return self.repository.rename_group(self.user.id, group_id, name)

    def save_workout(self, workout: WorkoutInput):
        return self.repository.save_workout(self.user.id, workout)

    def workouts(self, group_id: UUID | None, limit: int, offset: int):
        return self.repository.workouts(self.user.id, group_id, limit, offset)

    def leave_group(self, group_id: UUID, expected_joined_at: datetime):
        return self.repository.end_membership(
            self.user.id, group_id, self.user.id, expected_joined_at, owner_action=False
        )

    def remove_member(self, group_id: UUID, member_id: UUID, expected_joined_at: datetime):
        return self.repository.end_membership(
            self.user.id, group_id, member_id, expected_joined_at, owner_action=True
        )
