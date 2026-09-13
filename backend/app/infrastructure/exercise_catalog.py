from uuid import UUID

from psycopg import Connection

from app.domain.errors import Conflict, NotFound
from app.domain.exercise_catalog import DEFAULT_BODY_PARTS, DEFAULT_EXERCISES, ExerciseOptionUpdate


class ExerciseCatalogRepository:
    def __init__(self, connection: Connection):
        self.connection = connection

    def initialize(self, user_id: UUID):
        with self.connection.transaction():
            created = self.connection.execute(
                """INSERT INTO public.gotore_exercise_catalogs (user_id) VALUES (%s)
                ON CONFLICT (user_id) DO NOTHING RETURNING user_id""",
                (user_id,),
            ).fetchone()
            if created:
                for name in DEFAULT_EXERCISES:
                    self.add(user_id, name, *DEFAULT_BODY_PARTS[name])

    def options(self, user_id: UUID):
        return self.connection.execute(
            """SELECT id, name, primary_body_part, secondary_body_parts, revision
            FROM public.gotore_exercise_options
            WHERE user_id = %s ORDER BY created_at, name, id""",
            (user_id,),
        ).fetchall()

    def add(self, user_id: UUID, name: str, primary_body_part="other", secondary_body_parts=None):
        # 同名の再送は同じ候補に集約し、並行した追加でも重複させない。
        return self.connection.execute(
            """INSERT INTO public.gotore_exercise_options
            (user_id, name, primary_body_part, secondary_body_parts) VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id, name, primary_body_part, secondary_body_parts, revision""",
            (user_id, name, primary_body_part, secondary_body_parts or []),
        ).fetchone()

    def update(self, user_id: UUID, option_id: UUID, data: ExerciseOptionUpdate):
        with self.connection.transaction():
            row = self.connection.execute(
                """SELECT id, name, primary_body_part, secondary_body_parts, revision
                FROM public.gotore_exercise_options WHERE id = %s AND user_id = %s FOR UPDATE""",
                (option_id, user_id),
            ).fetchone()
            if row is None:
                raise NotFound("種目が見つかりません")
            same = (
                row["primary_body_part"] == data.primary_body_part
                and row["secondary_body_parts"] == data.secondary_body_parts
            )
            if row["revision"] != data.expected_revision:
                if same and row["revision"] == data.expected_revision + 1:
                    return row
                raise Conflict("別の更新があります。最新の部位を読み直してください")
            if same:
                return row
            return self.connection.execute(
                """UPDATE public.gotore_exercise_options
                SET primary_body_part = %s, secondary_body_parts = %s, revision = revision + 1
                WHERE id = %s AND user_id = %s
                RETURNING id, name, primary_body_part, secondary_body_parts, revision""",
                (data.primary_body_part, data.secondary_body_parts, option_id, user_id),
            ).fetchone()

    def delete(self, user_id: UUID, option_id: UUID):
        deleted = self.connection.execute(
            "DELETE FROM public.gotore_exercise_options WHERE id = %s AND user_id = %s",
            (option_id, user_id),
        )
        if deleted.rowcount == 0:
            raise NotFound("種目を削除できません")
