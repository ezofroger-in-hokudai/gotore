from uuid import UUID

from app.domain.errors import NotFound

# 記録に保存済みセットと共有先があることだけを確認する。
# グループは記録の表示経路であり、スタンプそのものの所属ではない。
VISIBLE = """EXISTS (SELECT 1 FROM jsonb_array_elements(w.exercises) e
      WHERE jsonb_array_length(e->'sets') > 0)
    AND (w.group_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.gotore_workout_shares s WHERE s.workout_id = w.id))"""


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
            if remove:
                self.connection.execute(
                    "DELETE FROM public.gotore_workout_stamps WHERE workout_id=%s "
                    "AND sender_id=%s AND kind=%s",
                    (workout_id, user_id, kind),
                )
            else:
                self.connection.execute(
                    "INSERT INTO public.gotore_workout_stamps "
                    "(workout_id,recipient_id,sender_id,kind) VALUES (%s,%s,%s,%s) "
                    "ON CONFLICT (workout_id,sender_id,kind) DO NOTHING",
                    (workout_id, recipient, user_id, kind),
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
                can_send = True
            scope = VISIBLE + (" AND r.recipient_id = %(user)s" if inbox else "")
            if inbox and group_id is not None:
                scope += """ AND EXISTS (
                    SELECT 1 FROM public.gotore_group_members m
                    WHERE m.group_id=%(group)s AND m.user_id=w.user_id)
                    AND (w.group_id=%(group)s OR EXISTS (
                      SELECT 1 FROM public.gotore_workout_shares s
                      WHERE s.workout_id=w.id AND s.group_id=%(group)s))"""
            scope += " AND (%(workout)s::uuid IS NULL OR r.workout_id=%(workout)s)"
            params = {"user": user_id, "group": group_id, "workout": workout_id, "offset": offset}
            # 合計とページを同じスナップショットで取得する。
            row = self.connection.execute(
                """WITH visible AS MATERIALIZED (
                    SELECT r.*, p.display_name, route.id AS group_id, route.name AS group_name,
                        w.performed_on,
                        coalesce(w.exercises->0->>'name','記録') AS exercise
                    FROM public.gotore_workout_stamps r
                    JOIN public.gotore_workouts w ON w.id=r.workout_id
                    JOIN public.gotore_profiles p ON p.id=r.sender_id
                    JOIN LATERAL (
                      SELECT g.id,g.name FROM public.gotore_groups g
                      JOIN public.gotore_group_members m ON m.group_id=g.id
                        AND m.user_id=w.user_id
                      WHERE (%(group)s::uuid IS NULL OR g.id=%(group)s)
                        AND (w.group_id=g.id OR EXISTS (
                          SELECT 1 FROM public.gotore_workout_shares s
                          WHERE s.workout_id=w.id AND s.group_id=g.id))
                      ORDER BY g.created_at,g.id LIMIT 1
                    ) route ON TRUE WHERE """
                + scope
                + """
                ), page AS (SELECT * FROM visible ORDER BY created_at DESC,id DESC
                    LIMIT 50 OFFSET %(offset)s)
                SELECT count(*)::integer AS total,
                    count(DISTINCT sender_id)::integer AS people,
                    coalesce((SELECT jsonb_object_agg(kind,n) FROM
                      (SELECT kind,count(*)::integer n FROM visible GROUP BY kind) totals),
                      '{}'::jsonb) AS counts,
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

    def summaries(self, user_id, group_id, workout_ids):
        with self.connection.transaction():
            self.repository.group(user_id, group_id, lock_membership=True)
            # 表示対象を先に絞り、全件の種類別集計を1回のSQLで返す。
            rows = self.connection.execute(
                """WITH workouts AS MATERIALIZED (
                    SELECT w.id,w.user_id FROM public.gotore_workouts w
                    JOIN public.gotore_group_members m
                      ON m.group_id=%(group)s AND m.user_id=w.user_id
                    WHERE w.id=ANY(%(ids)s) AND (w.group_id=%(group)s OR EXISTS (
                      SELECT 1 FROM public.gotore_workout_shares s
                      WHERE s.workout_id=w.id AND s.group_id=%(group)s))
                    AND EXISTS (SELECT 1 FROM jsonb_array_elements(w.exercises) e
                      WHERE jsonb_array_length(e->'sets')>0)
                ), counts AS MATERIALIZED (
                    SELECT r.workout_id,r.kind,count(*)::integer n,
                      bool_or(r.sender_id=%(user)s) mine
                    FROM public.gotore_workout_stamps r
                    JOIN workouts w ON w.id=r.workout_id
                    GROUP BY r.workout_id,r.kind
                ) SELECT w.id,true can_send,
                  coalesce((SELECT jsonb_object_agg(c.kind,c.n) FROM counts c
                    WHERE c.workout_id=w.id),'{}'::jsonb) counts,
                  coalesce((SELECT array_agg(c.kind) FROM counts c
                    WHERE c.workout_id=w.id AND c.mine),ARRAY[]::text[]) mine
                FROM workouts w""",
                {"user": user_id, "group": group_id, "ids": workout_ids},
            ).fetchall()
            return {str(row["id"]): {k: v for k, v in row.items() if k != "id"} for row in rows}

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
