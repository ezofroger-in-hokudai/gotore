"""永続ワーカー: uv run python -m app.services.notification_dispatch"""

import json
import logging
import time
from collections import defaultdict

import psycopg
from psycopg.rows import dict_row
from pywebpush import WebPushException, webpush

from app.core.config import settings
from app.infrastructure.notifications import EVENT_VISIBLE, NotificationRepository

logger = logging.getLogger(__name__)


def dispatch(connection, send=webpush):
    """行ロックで複数ワーカーの同時配信を避け、失敗はDBに残して再試行する。"""
    with connection.transaction():
        rows = connection.execute(
            """SELECT d.event_id,d.subscription_id,d.attempts,s.user_id,s.endpoint,s.keys,
            s.last_active_at,e.kind,e.seen_at,
            coalesce(p.push_stamp,true) push_stamp,coalesce(p.push_start,true) push_start,
            clock_timestamp()-coalesce(s.last_active_at,'epoch') < interval '8 seconds' foreground,
            """
            + EVENT_VISIBLE
            + """ AS visible
            FROM public.gotore_push_deliveries d
            JOIN public.gotore_push_subscriptions s ON s.id=d.subscription_id
            JOIN public.gotore_notification_events e ON e.id=d.event_id
            JOIN public.gotore_workouts w ON w.id=e.workout_id
            LEFT JOIN public.gotore_workout_stamps r ON r.id=e.stamp_id
            LEFT JOIN public.gotore_notification_settings p ON p.user_id=s.user_id
            WHERE d.delivered_at IS NULL AND d.next_attempt_at<=clock_timestamp()
            ORDER BY d.next_attempt_at LIMIT 100 FOR UPDATE OF d SKIP LOCKED"""
        ).fetchall()
        groups = defaultdict(list)
        for row in rows:
            groups[(row["subscription_id"], row["kind"])].append(row)
        for (subscription_id, kind), items in groups.items():
            row = items[0]
            visible = [x for x in items if x["visible"] and x["seen_at"] is None]
            if row["foreground"] and row[f"push_{kind}"] and visible:
                # 起動中はOSへ出さず保留し、閉じた直後のイベントも配信から落とさない。
                for item in items:
                    connection.execute(
                        "UPDATE public.gotore_push_deliveries "
                        "SET next_attempt_at=clock_timestamp()+interval '2 seconds' "
                        "WHERE event_id=%s AND subscription_id=%s",
                        (item["event_id"], subscription_id),
                    )
                continue
            suppressed = not row[f"push_{kind}"] or not visible
            succeeded = suppressed
            gone = False
            if not suppressed:
                count = NotificationRepository(connection).pending_count(row["user_id"], kind)
                try:
                    send(
                        subscription_info={"endpoint": row["endpoint"], "keys": row["keys"]},
                        data=json.dumps({"kind": kind, "count": max(count, len(visible))}),
                        vapid_private_key=settings.vapid_private_key,
                        vapid_claims={"sub": settings.vapid_subject},
                        headers={"Topic": f"egotore-{kind}"},
                        ttl=300 if kind == "start" else 3600,
                        timeout=5,
                    )
                    succeeded = True
                except WebPushException as error:
                    gone = error.response is not None and error.response.status_code in (404, 410)
                except Exception:
                    # 購読の鍵やendpointはログへ出さない。
                    logger.warning("Push配信に失敗しました。再試行します")
            if gone:
                connection.execute(
                    "DELETE FROM public.gotore_push_subscriptions WHERE id=%s", (subscription_id,)
                )
                continue
            for item in items:
                connection.execute(
                    """UPDATE public.gotore_push_deliveries SET attempts=attempts+1,
                    delivered_at=CASE WHEN %s OR attempts>=9 THEN clock_timestamp() ELSE NULL END,
                    next_attempt_at=clock_timestamp()+make_interval(secs=>least(300,5*power(2,least(attempts,6)))::int)
                    WHERE event_id=%s AND subscription_id=%s""",
                    (succeeded, item["event_id"], subscription_id),
                )
    return len(rows)


def main():
    if not all((settings.database_url, settings.vapid_private_key, settings.vapid_public_key)):
        raise SystemExit("DATABASE_URLとVAPID_PUBLIC_KEY/VAPID_PRIVATE_KEYを設定してください")
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            with psycopg.connect(
                settings.database_url, autocommit=True, row_factory=dict_row, prepare_threshold=None
            ) as connection:
                while True:
                    dispatch(connection)
                    time.sleep(2)
        except (psycopg.Error, OSError):
            logger.warning("通知DBへ再接続します")
            time.sleep(5)


if __name__ == "__main__":
    main()
