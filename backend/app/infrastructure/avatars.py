from uuid import UUID, uuid4

from psycopg import Connection


class AvatarRepository:
    def __init__(self, connection: Connection):
        self.connection = connection

    def get(self, viewer_id: UUID, owner_id: UUID):
        return self.connection.execute(
            """SELECT a.version, a.image FROM public.gotore_avatars a
            WHERE a.user_id = %s AND (%s = a.user_id OR EXISTS (
              SELECT 1 FROM public.gotore_group_members viewer
              JOIN public.gotore_group_members owner ON owner.group_id = viewer.group_id
              WHERE viewer.user_id = %s AND owner.user_id = a.user_id))""",
            (owner_id, viewer_id, viewer_id),
        ).fetchone()

    def save(self, user_id: UUID, image: bytes):
        return self.connection.execute(
            """INSERT INTO public.gotore_avatars (user_id, version, image)
            VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE
            SET version = EXCLUDED.version, image = EXCLUDED.image
            RETURNING version, image""",
            (user_id, uuid4(), image),
        ).fetchone()

    def delete(self, user_id: UUID):
        self.connection.execute("DELETE FROM public.gotore_avatars WHERE user_id = %s", (user_id,))
