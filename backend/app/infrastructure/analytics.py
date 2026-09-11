from uuid import UUID

from app.domain.analytics import AnalyticsWindow, build_analytics
from app.infrastructure.training_repository import TrainingRepository


class AnalyticsRepository:
    def __init__(self, repository: TrainingRepository):
        self.repository = repository
        self.connection = repository.connection

    def read(
        self,
        user_id: UUID,
        window: AnalyticsWindow,
        exercise: str | None,
        group_id: UUID | None = None,
    ):
        # 閲覧者の参加行をロックし、取得中の退出・除外と競合しないようにする。
        with self.connection.transaction():
            if group_id is not None:
                self.repository.group(user_id, group_id, lock_membership=True)
                scope = """EXISTS (SELECT 1 FROM public.gotore_group_members m
                    WHERE m.group_id = %(group_id)s AND m.user_id = w.user_id)
                    AND (w.group_id = %(group_id)s OR EXISTS (
                        SELECT 1 FROM public.gotore_workout_shares s
                        WHERE s.workout_id = w.id AND s.group_id = %(group_id)s))"""
            else:
                scope = "w.user_id = %(user_id)s"
            params = {
                "user_id": user_id,
                "group_id": group_id,
                "exercise": exercise,
                "start": window.previous_start or window.start,
                "end": window.end,
            }
            # scopeは固定SQLのみ。種目名・日付・ユーザー入力はすべてバインドする。
            names = self.connection.execute(
                "SELECT DISTINCT f.exercise_name FROM public.gotore_workout_statistics f "
                "JOIN public.gotore_workouts w ON w.id = f.workout_id WHERE "
                + scope
                + " ORDER BY f.exercise_name",
                params,
            ).fetchall()
            rows = self.connection.execute(
                """SELECT w.performed_on AS date, w.user_id, p.display_name,
                    sum(f.set_count)::integer AS sets, sum(f.volume) AS volume,
                    max(f.best_weight) AS weight, max(f.best_rm) AS rm
                    FROM public.gotore_workout_statistics f
                    JOIN public.gotore_workouts w ON w.id = f.workout_id
                    JOIN public.gotore_profiles p ON p.id = w.user_id WHERE """
                + scope
                + """
                    AND w.performed_on BETWEEN %(start)s AND %(end)s
                    AND (%(exercise)s::text IS NULL OR f.exercise_name = %(exercise)s)
                    GROUP BY w.performed_on, w.user_id, p.display_name
                    ORDER BY w.performed_on, w.user_id""",
                params,
            ).fetchall()
            return build_analytics(
                window,
                rows,
                [row["exercise_name"] for row in names],
                exercise,
                group_id is not None,
            )
