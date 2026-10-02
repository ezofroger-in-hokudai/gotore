from psycopg.types.json import Jsonb

from app.schemas.notifications import NotificationSettings

# 現在の共有と両者の所属を毎回確認し、退会/共有解除後の開始は出さない。
START_VISIBLE = """w.started_at IS NOT NULL AND w.ended_at IS NULL
 AND w.last_seen_at > clock_timestamp()-interval '5 minutes'
 AND EXISTS(SELECT 1 FROM public.gotore_workout_shares sh
 JOIN public.gotore_group_members recipient ON recipient.group_id=sh.group_id
 JOIN public.gotore_group_members sender ON sender.group_id=sh.group_id
 WHERE sh.workout_id=w.id AND recipient.user_id=e.recipient_id
 AND sender.user_id=e.sender_id)"""
STAMP_VISIBLE = """r.id IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(w.exercises) x
 WHERE jsonb_array_length(x->'sets')>0)
 AND (w.group_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.gotore_workout_shares sh
 WHERE sh.workout_id=w.id))"""
EVENT_VISIBLE = f"((e.kind='start' AND {START_VISIBLE}) OR (e.kind='stamp' AND {STAMP_VISIBLE}))"


class NotificationRepository:
    def __init__(self, connection):
        self.connection = connection

    def settings(self, user_id):
        row = self.connection.execute(
            "SELECT * FROM public.gotore_notification_settings WHERE user_id=%s", (user_id,)
        ).fetchone()
        return NotificationSettings.model_validate(row or {}).model_dump()

    def save_settings(self, user_id, data):
        values = data.model_dump()
        columns = ",".join(values)
        updates = ",".join(f"{k}=EXCLUDED.{k}" for k in values)
        self.connection.execute(
            f"INSERT INTO public.gotore_notification_settings(user_id,{columns}) "
            f"VALUES (%s,{','.join(['%s'] * len(values))}) ON CONFLICT(user_id) "
            f"DO UPDATE SET {updates}",
            (user_id, *values.values()),
        )
        return values

    def inbox(self, user_id):
        return self.connection.execute(
            """SELECT e.id,e.kind,e.sender_id,e.workout_id,e.created_at,p.display_name,
            a.version AS avatar_version,r.kind AS stamp_kind,
            CASE WHEN e.kind='start' THEN w.last_seen_at+interval '5 minutes' END live_until
            FROM public.gotore_notification_events e
            JOIN public.gotore_workouts w ON w.id=e.workout_id
            JOIN public.gotore_profiles p ON p.id=e.sender_id
            LEFT JOIN public.gotore_workout_stamps r ON r.id=e.stamp_id
            LEFT JOIN public.gotore_avatars a ON a.user_id=e.sender_id
              AND EXISTS(SELECT 1 FROM public.gotore_group_members viewer
              JOIN public.gotore_group_members owner ON owner.group_id=viewer.group_id
              WHERE viewer.user_id=e.recipient_id AND owner.user_id=e.sender_id)
            WHERE e.recipient_id=%s AND e.seen_at IS NULL AND """
            + EVENT_VISIBLE
            + " ORDER BY e.created_at,e.id LIMIT 100",
            (user_id,),
        ).fetchall()

    def pending_count(self, user_id, kind):
        return self.connection.execute(
            "SELECT count(*) n FROM public.gotore_notification_events e "
            "JOIN public.gotore_workouts w ON w.id=e.workout_id "
            "LEFT JOIN public.gotore_workout_stamps r ON r.id=e.stamp_id "
            "WHERE e.recipient_id=%s AND e.kind=%s AND e.seen_at IS NULL AND " + EVENT_VISIBLE,
            (user_id, kind),
        ).fetchone()["n"]

    def live_start_ids(self, user_id):
        return [
            r["id"]
            for r in self.connection.execute(
                "SELECT e.id FROM public.gotore_notification_events e "
                "JOIN public.gotore_workouts w ON w.id=e.workout_id "
                "WHERE e.recipient_id=%s AND e.kind='start' AND " + START_VISIBLE,
                (user_id,),
            ).fetchall()
        ]

    def seen(self, user_id, ids):
        with self.connection.transaction():
            stamps = self.connection.execute(
                "UPDATE public.gotore_notification_events SET seen_at=clock_timestamp() "
                "WHERE recipient_id=%s AND id=ANY(%s) RETURNING stamp_id",
                (user_id, ids),
            ).fetchall()
            self.connection.execute(
                "UPDATE public.gotore_workout_stamps SET announced_at="
                "coalesce(announced_at,clock_timestamp()) WHERE recipient_id=%s AND id=ANY(%s)",
                (user_id, [r["stamp_id"] for r in stamps if r["stamp_id"]]),
            )

    def subscribe(self, user_id, subscription):
        # 同じブラウザでアカウントを変えた場合も、前の所有者へ通知しない。
        with self.connection.transaction():
            self.connection.execute(
                "DELETE FROM public.gotore_push_subscriptions WHERE endpoint=%s AND user_id<>%s",
                (subscription.endpoint, user_id),
            )
            return self.connection.execute(
                """INSERT INTO public.gotore_push_subscriptions
                (user_id,endpoint,keys,last_active_at)
                VALUES(%s,%s,%s,clock_timestamp()) ON CONFLICT(endpoint) DO UPDATE
                SET keys=EXCLUDED.keys,last_active_at=EXCLUDED.last_active_at RETURNING id""",
                (user_id, subscription.endpoint, Jsonb(subscription.keys)),
            ).fetchone()

    def unsubscribe(self, user_id, endpoint):
        self.connection.execute(
            "DELETE FROM public.gotore_push_subscriptions WHERE user_id=%s AND endpoint=%s",
            (user_id, endpoint),
        )

    def presence(self, user_id, subscription_id, active=True):
        self.connection.execute(
            "UPDATE public.gotore_push_subscriptions "
            "SET last_active_at=CASE WHEN %s THEN clock_timestamp() ELSE NULL END "
            "WHERE user_id=%s AND id=%s",
            (active, user_id, subscription_id),
        )
