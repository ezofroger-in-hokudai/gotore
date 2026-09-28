from uuid import UUID

from psycopg import Connection

from app.infrastructure.exercise_catalog import ExerciseCatalogRepository
from app.infrastructure.sessions import SessionRepository


class RecordSnapshotRepository:
    def __init__(self, connection: Connection):
        self.connection = connection

    def read(self, user_id: UUID):
        # 一度の読み取りトランザクションで全件を取得し、削除や追加をページ間で取りこぼさない。
        workouts = self.connection.execute(
            """SELECT w.*, p.display_name, a.version AS avatar_version,
            ARRAY(SELECT s.group_id FROM public.gotore_workout_shares s
                WHERE s.workout_id = w.id ORDER BY s.group_id) AS shared_group_ids
            FROM public.gotore_workouts w
            JOIN public.gotore_profiles p ON p.id = w.user_id
            LEFT JOIN public.gotore_avatars a ON a.user_id = w.user_id
            WHERE w.user_id = %s
            ORDER BY w.performed_on DESC, w.created_at DESC, w.id""",
            (user_id,),
        ).fetchall()
        sessions = SessionRepository(self.connection)
        options = ExerciseCatalogRepository(self.connection).options(user_id)
        names = {option["name"] for option in options}
        names.update(exercise["name"] for row in workouts for exercise in row["exercises"])
        names.update(
            row["name"]
            for row in self.connection.execute(
                "SELECT name FROM public.gotore_exercise_memos WHERE user_id = %s", (user_id,)
            ).fetchall()
        )
        active = next(
            (row["id"] for row in workouts if row["started_at"] and not row["ended_at"]), None
        )
        contexts = {name: sessions.context(user_id, name, active) for name in sorted(names)}
        workout_memos = self.connection.execute(
            """SELECT m.workout_id, m.content, m.revision
            FROM public.gotore_workout_memos m
            JOIN public.gotore_workouts w ON w.id = m.workout_id
            WHERE w.user_id = %s""",
            (user_id,),
        ).fetchall()
        session_memos = self.connection.execute(
            """SELECT m.workout_id, m.name, m.content, m.revision
            FROM public.gotore_session_exercise_memos m
            JOIN public.gotore_workouts w ON w.id = m.workout_id
            WHERE w.user_id = %s""",
            (user_id,),
        ).fetchall()
        session_memos_by_workout = {}
        for row in session_memos:
            session_memos_by_workout.setdefault(str(row["workout_id"]), {})[row["name"]] = {
                "content": row["content"],
                "revision": row["revision"],
            }
        return {
            "user_id": user_id,
            "workouts": sessions.with_bests(workouts),
            "options": options,
            "contexts": contexts,
            "workout_memos": {str(row["workout_id"]): row for row in workout_memos},
            "session_exercise_memos": session_memos_by_workout,
        }
