from datetime import date, datetime
from uuid import UUID

from app.domain.activity import month_bounds, validate_activity_date
from app.domain.identity import AuthenticatedUser
from app.domain.workout import WorkoutInput, WorkoutUpdate
from app.domain.workout_memo import WorkoutMemoInput
from app.infrastructure.scores import ScoreRepository
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

    def renew_invite_code(self, group_id: UUID, expected_invite_code: str):
        return self.repository.renew_invite_code(self.user.id, group_id, expected_invite_code)

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
            best_score=max((day.score for day in days if day.score is not None), default=None),
            total_sets=sum(day.set_count for day in days),
            workout_count=sum(day.workout_count for day in days),
            active_days=len(days),
            days=days,
        )

    def workouts(
        self,
        group_id: UUID | None,
        limit: int,
        offset: int,
        performed_on: date | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ):
        if performed_on is not None:
            validate_activity_date(performed_on)
        if date_from is not None or date_to is not None:
            if date_from is None or date_to is None or date_from > date_to or performed_on:
                raise ValueError("期間の開始日と終了日を正しく指定してください")
            validate_activity_date(date_from)
            validate_activity_date(date_to)
        records = self.repository.workouts(
            self.user.id, group_id, limit, offset, performed_on, date_from, date_to
        )
        return ScoreRepository(self.repository.connection).attach(records, group_id)

    def shared_workout(self, group_id: UUID, workout_id: UUID):
        record = self.repository.shared_workout(self.user.id, group_id, workout_id)
        return ScoreRepository(self.repository.connection).attach([record], group_id)[0]

    def update_workout(self, workout_id: UUID, workout: WorkoutUpdate):
        with self.repository.connection.transaction():
            record = self.repository.update_workout(self.user.id, workout_id, workout)
            scores = ScoreRepository(self.repository.connection)
            row = scores.prepare(record, refresh=True)
            return {**record, "score": scores.present(row, record["revision"])}

    def delete_workout(self, workout_id: UUID, expected_revision: int):
        return self.repository.delete_workout(self.user.id, workout_id, expected_revision)

    def leave_group(self, group_id: UUID, expected_joined_at: datetime):
        return self.repository.end_membership(
            self.user.id, group_id, self.user.id, expected_joined_at, owner_action=False
        )

    def remove_member(self, group_id: UUID, member_id: UUID, expected_joined_at: datetime):
        return self.repository.end_membership(
            self.user.id, group_id, member_id, expected_joined_at, owner_action=True
        )

    def workout_memo(self, workout_id: UUID):
        return self.repository.workout_memo(self.user.id, workout_id)

    def save_workout_memo(self, workout_id: UUID, memo: WorkoutMemoInput):
        return self.repository.save_workout_memo(self.user.id, workout_id, memo)
