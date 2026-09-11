from uuid import UUID

from psycopg.types.json import Jsonb

from app.domain.errors import Conflict
from app.domain.goal import STANDARD_CRITERIA, STANDARD_GOAL, GoalInput


class GoalRepository:
    def __init__(self, connection):
        self.connection = connection

    def current(self, user_id: UUID):
        row = self.connection.execute(
            """SELECT * FROM public.gotore_goal_versions WHERE user_id = %s
            ORDER BY version DESC LIMIT 1""",
            (user_id,),
        ).fetchone()
        if row:
            return row
        with self.connection.transaction():
            self.connection.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 1))", (str(user_id),)
            )
            self.connection.execute(
                """INSERT INTO public.gotore_goal_versions
                (user_id, version, body, is_standard, criteria)
                VALUES (%s, 1, %s, true, %s) ON CONFLICT (user_id, version) DO NOTHING""",
                (user_id, STANDARD_GOAL, Jsonb(STANDARD_CRITERIA)),
            )
            return self.current(user_id)

    def save(self, user_id: UUID, data: GoalInput):
        with self.connection.transaction():
            # 開始と同じ本人ロックで、どちらの目標を固定するかを確定する。
            self.connection.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 1))", (str(user_id),)
            )
            prior = self.current(user_id)
            values = data.model_dump(mode="json")
            unchanged = all(
                prior[key] == values[key] for key in ("body", "is_standard", "criteria")
            )
            if prior["version"] != data.expected_version:
                if prior["version"] == data.expected_version + 1 and unchanged:
                    return prior
                raise Conflict("目標が変更されています。読み直してください")
            if unchanged:
                return prior
            return self.connection.execute(
                """INSERT INTO public.gotore_goal_versions
            (user_id, version, body, is_standard, criteria)
                VALUES (%s, %s, %s, %s, %s) RETURNING *""",
                (
                    user_id,
                    prior["version"] + 1,
                    data.body,
                    data.is_standard,
                    Jsonb(values["criteria"]),
                ),
            ).fetchone()
