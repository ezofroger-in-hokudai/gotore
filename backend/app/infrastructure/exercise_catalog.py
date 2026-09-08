from uuid import UUID

from psycopg import Connection

from app.domain.errors import NotFound
from app.domain.exercise_catalog import DEFAULT_EXERCISES


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
                    self.add(user_id, name)

    def options(self, user_id: UUID):
        return self.connection.execute(
            """SELECT id, name FROM public.gotore_exercise_options
            WHERE user_id = %s ORDER BY created_at, name, id""",
            (user_id,),
        ).fetchall()

    def add(self, user_id: UUID, name: str):
        # 同名の再送は同じ候補に集約し、並行した追加でも重複させない。
        return self.connection.execute(
            """INSERT INTO public.gotore_exercise_options (user_id, name) VALUES (%s, %s)
            ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id, name""",
            (user_id, name),
        ).fetchone()

    def delete(self, user_id: UUID, option_id: UUID):
        deleted = self.connection.execute(
            "DELETE FROM public.gotore_exercise_options WHERE id = %s AND user_id = %s",
            (option_id, user_id),
        )
        if deleted.rowcount == 0:
            raise NotFound("種目が見つからないか、削除する権限がありません")
