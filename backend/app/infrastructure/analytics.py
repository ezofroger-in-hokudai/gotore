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
        member_id: UUID | None = None,
        body_part: str | None = None,
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
            if member_id is not None:
                scope += " AND w.user_id = %(member_id)s"
            params = {
                "member_id": member_id,
                "user_id": user_id,
                "group_id": group_id,
                "exercise": exercise,
                "body_part": body_part,
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
                    f.exercise_name,
                    sum(f.set_count)::integer AS sets, sum(f.volume) AS volume,
                    max(f.best_weight) AS weight, max(f.best_rm) AS rm
                    FROM public.gotore_workout_statistics f
                    JOIN public.gotore_workouts w ON w.id = f.workout_id
                    LEFT JOIN public.gotore_exercise_options o
                        ON o.user_id = w.user_id AND o.name = f.exercise_name
                    JOIN public.gotore_profiles p ON p.id = w.user_id WHERE """
                + scope
                + """
                    AND w.performed_on BETWEEN %(start)s AND %(end)s
                    AND (%(exercise)s::text IS NULL OR f.exercise_name = %(exercise)s)
                    AND (%(body_part)s::text IS NULL OR
                        COALESCE(NULLIF(o.primary_body_part, 'full_body'), 'other') = %(body_part)s)
                    GROUP BY w.performed_on, w.user_id, p.display_name, f.exercise_name
                    ORDER BY w.performed_on, w.user_id, f.exercise_name""",
                params,
            ).fetchall()
            return build_analytics(
                window,
                rows,
                [row["exercise_name"] for row in names],
                exercise,
                group_id is not None,
                group_id is None,
            )

    def personal_summary(self, user_id: UUID):
        totals = self.connection.execute(
            """SELECT COUNT(DISTINCT w.id)::integer AS workout_count,
                COALESCE(SUM(s.set_count), 0)::integer AS total_sets,
                COALESCE(SUM(s.volume), 0) AS total_volume,
                MIN(w.performed_on) AS first_performed_on
            FROM public.gotore_workouts w
            JOIN public.gotore_workout_statistics s ON s.workout_id = w.id
            WHERE w.user_id = %s""",
            (user_id,),
        ).fetchone()
        exercises = self.connection.execute(
            """SELECT s.exercise_name AS name, MAX(w.performed_on) AS last_performed_on,
                COALESCE(NULLIF(o.primary_body_part, 'full_body'), 'other') AS body_part
            FROM public.gotore_workout_statistics s
            JOIN public.gotore_workouts w ON w.id = s.workout_id
            LEFT JOIN public.gotore_exercise_options o
                ON o.user_id = w.user_id AND o.name = s.exercise_name
            WHERE w.user_id = %s
            GROUP BY s.exercise_name, o.primary_body_part
            ORDER BY last_performed_on DESC, s.exercise_name""",
            (user_id,),
        ).fetchall()
        return {**totals, "exercises": exercises}
