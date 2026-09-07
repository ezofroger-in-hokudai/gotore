from datetime import date
from uuid import UUID

from app.domain.activity import month_bounds, validate_activity_date
from app.domain.identity import AuthenticatedUser
from app.domain.workout import WorkoutInput
from app.infrastructure.training_repository import TrainingRepository
from app.schemas.activity import ActivityDay, MonthlyActivity


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

    def activity(self, month: str):
        start, end = month_bounds(month)
        days = [
            ActivityDay.model_validate(row)
            for row in self.repository.activity(self.user.id, start, end)
        ]
        return MonthlyActivity(
            month=month,
            total_sets=sum(day.set_count for day in days),
            workout_count=sum(day.workout_count for day in days),
            active_days=len(days),
            days=days,
        )

    def workouts(
        self, group_id: UUID | None, limit: int, offset: int, performed_on: date | None = None
    ):
        if performed_on is not None:
            validate_activity_date(performed_on)
        return self.repository.workouts(self.user.id, group_id, limit, offset, performed_on)
