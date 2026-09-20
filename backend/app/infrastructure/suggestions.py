from psycopg import Connection

from app.domain.errors import Conflict
from app.domain.identity import AuthenticatedUser
from app.domain.suggestion import SuggestionInput, SuggestionLimitReached
from app.infrastructure.training_repository import TrainingRepository


class SuggestionRepository:
    def __init__(self, connection: Connection):
        self.connection = connection

    def submit(self, user: AuthenticatedUser, data: SuggestionInput):
        with self.connection.transaction():
            # 同じ利用者の再送と連投判定を同じロックで直列化する。
            self.connection.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                (f"suggestion:{user.id}",),
            )
            existing = self.connection.execute(
                """SELECT id, content, created_at FROM public.gotore_suggestions
                WHERE user_id = %s AND id = %s""",
                (user.id, data.id),
            ).fetchone()
            if existing:
                if existing["content"] != data.content:
                    raise Conflict("同じ送信IDで内容を変更できません")
                return existing
            count = self.connection.execute(
                """SELECT count(*) AS total FROM public.gotore_suggestions
                WHERE user_id = %s AND created_at > now() - interval '24 hours'""",
                (user.id,),
            ).fetchone()["total"]
            if count >= 20:
                raise SuggestionLimitReached()
            profile = TrainingRepository(self.connection).profile(user)
            return self.connection.execute(
                """INSERT INTO public.gotore_suggestions (id, user_id, display_name, content)
                VALUES (%s, %s, %s, %s) RETURNING id, created_at""",
                (data.id, user.id, profile.display_name, data.content),
            ).fetchone()
