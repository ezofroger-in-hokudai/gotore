from uuid import UUID

from app.domain.errors import Conflict, NotFound

# 固定SQL。共有の所属と保存済みセットを毎回確認する。
VISIBLE = """(w.group_id = r.group_id OR EXISTS (
    SELECT 1 FROM public.gotore_workout_shares s
    WHERE s.workout_id = w.id AND s.group_id = r.group_id))
    AND EXISTS (SELECT 1 FROM public.gotore_group_members m
      WHERE m.group_id = r.group_id AND m.user_id = r.sender_id)
    AND EXISTS (SELECT 1 FROM public.gotore_group_members m
      WHERE m.group_id = r.group_id AND m.user_id = w.user_id)
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(w.exercises) e
      WHERE jsonb_array_length(e->'sets') > 0)"""


class StampRepository:
    def __init__(self, repository):
        self.repository = repository
        self.connection = repository.connection

    def target(self, user_id, group_id, workout_id):
        group = self.repository.group(user_id, group_id, lock_membership=True)
        row = self.connection.execute(
            """SELECT w.user_id, w.group_id, w.performed_on FROM public.gotore_workouts w
            JOIN public.gotore_group_members m ON m.group_id = %(group)s AND m.user_id = w.user_id
            WHERE w.id = %(workout)s AND (w.group_id = %(group)s OR EXISTS (
                SELECT 1 FROM public.gotore_workout_shares s
                WHERE s.workout_id = w.id AND s.group_id = %(group)s))
              AND EXISTS (SELECT 1 FROM jsonb_array_elements(w.exercises) e
                WHERE jsonb_array_length(e->'sets') > 0)
            FOR SHARE OF w, m""",
            {"group": group_id, "workout": workout_id},
        ).fetchone()
        if row is None:
            raise NotFound("記録を閲覧できません")
        # 共有解除のDELETEと送信を直列化する。
        share = self.connection.execute(
            "SELECT workout_id FROM public.gotore_workout_shares "
            "WHERE workout_id=%s AND group_id=%s FOR SHARE",
            (workout_id, group_id),
        ).fetchall()
        if row["group_id"] != group_id and not share:
            raise NotFound("記録を閲覧できません")
        return {**row, "group_name": group["name"]}

    def change(self, user_id, group_id, workout_id, kind, remove=False):
        with self.connection.transaction():
            recipient = self.target(user_id, group_id, workout_id)["user_id"]
            if recipient == user_id:
                raise Conflict("自分の記録には送れません")
            if remove:
                self.connection.execute(
                    "DELETE FROM public.gotore_workout_stamps WHERE workout_id=%s "
                    "AND group_id=%s AND sender_id=%s AND kind=%s",
                    (workout_id, group_id, user_id, kind),
                )
            else:
                self.connection.execute(
                    "INSERT INTO public.gotore_workout_stamps "
                    "(workout_id,recipient_id,group_id,sender_id,kind) VALUES (%s,%s,%s,%s,%s) "
                    "ON CONFLICT (workout_id,group_id,sender_id,kind) DO NOTHING",
                    (workout_id, recipient, group_id, user_id, kind),
                )
            return {"ok": True}

    def listing(self, user_id, group_id=None, workout_id=None, offset=0, inbox=False):
        with self.connection.transaction():
            can_send = False
            target = None
            if group_id is not None:
                self.repository.group(user_id, group_id, lock_membership=True)
            if not inbox:
                target = self.target(user_id, group_id, workout_id)
                can_send = target["user_id"] != user_id
            scope = VISIBLE + (" AND r.recipient_id = %(user)s" if inbox else "")
            scope += " AND (%(group)s::uuid IS NULL OR r.group_id=%(group)s)"
            scope += " AND (%(workout)s::uuid IS NULL OR r.workout_id=%(workout)s)"
            params = {"user": user_id, "group": group_id, "workout": workout_id, "offset": offset}
            # 合計とページを同じスナップショットで取得する。
            row = self.connection.execute(
                """WITH visible AS MATERIALIZED (
                    SELECT r.*, p.display_name, g.name AS group_name, w.performed_on,
                        coalesce(w.exercises->0->>'name','記録') AS exercise
                    FROM public.gotore_workout_stamps r
                    JOIN public.gotore_workouts w ON w.id=r.workout_id
                    JOIN public.gotore_profiles p ON p.id=r.sender_id
                    JOIN public.gotore_groups g ON g.id=r.group_id WHERE """
                + scope
                + """
                ), page AS (SELECT * FROM visible ORDER BY created_at DESC,id DESC
                    LIMIT 50 OFFSET %(offset)s)
                SELECT count(*)::integer AS total,
                    count(DISTINCT sender_id)::integer AS people,
                    coalesce(array_agg(DISTINCT kind) FILTER (WHERE sender_id=%(user)s),
                      ARRAY[]::text[]) AS mine,
                    count(*) FILTER (WHERE read_at IS NULL)::integer AS unread,
                    coalesce((SELECT jsonb_agg(jsonb_build_object(
                      'id',id,'workout_id',workout_id,'group_id',group_id,'group_name',group_name,
                      'sender_id',sender_id,'display_name',display_name,'kind',kind,
                      'mine',sender_id=%(user)s,
                      'created_at',created_at,'performed_on',performed_on,'exercise',exercise,
                      'read',read_at IS NOT NULL,'announced',announced_at IS NOT NULL)
                      ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb) AS items
                FROM visible""",
                params,
            ).fetchone()
            return {
                **row,
                "can_send": can_send,
                "target": target,
                "has_more": offset + 50 < row["total"],
            }

    def seen(self, user_id: UUID, ids: list[UUID], read: bool):
        self.connection.execute(
            """UPDATE public.gotore_workout_stamps r SET
              announced_at=coalesce(announced_at,clock_timestamp()),
              read_at=CASE WHEN %(read)s THEN coalesce(read_at,clock_timestamp()) ELSE read_at END
            FROM public.gotore_workouts w WHERE w.id=r.workout_id
              AND r.recipient_id=%(user)s AND r.id=ANY(%(ids)s) AND """
            + VISIBLE,
            {"user": user_id, "ids": ids, "read": read},
        )
