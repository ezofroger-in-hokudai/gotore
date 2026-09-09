from uuid import UUID

from psycopg.types.json import Jsonb

from app.domain.errors import Conflict, NotFound
from app.domain.session import (
    ExerciseMemoInput,
    SessionUpdate,
    estimated_rm,
    latest_change,
    personal_bests,
    session_best_sets,
)
from app.infrastructure.training_repository import TrainingRepository


class SessionRepository(TrainingRepository):
    def active(self, user_id: UUID):
        return self.connection.execute(
            """SELECT w.*, p.display_name,
            ARRAY(SELECT s.group_id FROM public.gotore_workout_shares s
                WHERE s.workout_id = w.id ORDER BY s.group_id) AS shared_group_ids
            FROM public.gotore_workouts w
            JOIN public.gotore_profiles p ON p.id = w.user_id
            WHERE w.user_id = %s AND w.started_at IS NOT NULL AND w.ended_at IS NULL""",
            (user_id,),
        ).fetchone()

    def with_shares(self, row):
        if row is None:
            return None
        if "shared_group_ids" in row:
            return row
        shares = self.connection.execute(
            """SELECT group_id FROM public.gotore_workout_shares
            WHERE workout_id = %s ORDER BY group_id""",
            (row["id"],),
        ).fetchall()
        return {**row, "shared_group_ids": [s["group_id"] for s in shares]}

    def start(self, user_id: UUID, workout_id: UUID):
        with self.connection.transaction():
            # 別端末からの同時開始も本人単位で一つにする。
            self.connection.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 1))", (str(user_id),)
            )
            self.lock_workout(workout_id)
            if existing := self.owned_workout(user_id, workout_id):
                if existing["started_at"] is None:
                    raise Conflict("記録IDが使用済みです")
                return self.with_shares(existing)
            if active := self.active(user_id):
                return self.with_shares(active)
            if self.connection.execute(
                """SELECT id FROM public.gotore_deleted_workouts WHERE id = %s
                UNION ALL SELECT id FROM public.gotore_workouts WHERE id = %s""",
                (workout_id, workout_id),
            ).fetchone():
                raise Conflict("記録IDが使用済みです")
            memberships = self.connection.execute(
                """SELECT group_id FROM public.gotore_group_members
                WHERE user_id = %s ORDER BY group_id FOR SHARE""",
                (user_id,),
            ).fetchall()
            group_ids = [membership["group_id"] for membership in memberships]
            # 所属の行ロックを保持したまま、開始・共有・当日の活動を一括で保存する。
            row = self.connection.execute(
                """WITH started AS (INSERT INTO public.gotore_workouts
                (id, user_id, performed_on, exercises, started_at, last_seen_at)
                VALUES (%s, %s, (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date,
                '[]', clock_timestamp(), clock_timestamp()) RETURNING *),
                shared AS (INSERT INTO public.gotore_workout_shares (workout_id, group_id, user_id)
                    SELECT s.id, g.id, s.user_id FROM started s, unnest(%s::uuid[]) AS g(id)),
                activity AS (INSERT INTO public.gotore_session_days (workout_id, day)
                    SELECT id, performed_on FROM started)
                SELECT s.*, p.display_name FROM started s
                JOIN public.gotore_profiles p ON p.id = s.user_id""",
                (workout_id, user_id, group_ids),
            ).fetchone()
            return {**row, "shared_group_ids": group_ids}

    def session(self, user_id: UUID, workout_id: UUID):
        record = self.owned_workout(user_id, workout_id)
        if record is None or record["started_at"] is None:
            raise NotFound("トレーニングが見つかりません")
        return record

    def save_session(self, user_id: UUID, workout_id: UUID, data: SessionUpdate):
        exercises = data.model_dump(mode="json")["exercises"]
        with self.connection.transaction():
            self.lock_workout(workout_id)
            row = self.session(user_id, workout_id)
            if row["ended_at"] is not None:
                raise Conflict("終了済みです。履歴から編集してください")
            unchanged = row["exercises"] == exercises
            if row["revision"] != data.expected_revision:
                if row["revision"] == data.expected_revision + 1 and unchanged:
                    return self.with_shares(row)
                raise Conflict("別の更新があります。保存済みを読み直してください")
            if not unchanged:
                change = latest_change(row["exercises"], exercises)
                ei, si, added = change if change else (None, None, False)
                is_best = False
                if added:
                    exercise = exercises[ei]
                    value = exercise["sets"][si]
                    previous = self.bests(user_id, exercise["name"])
                    rm = estimated_rm(value["weight"], value["reps"])
                    is_best = (
                        previous["best_weight"] is not None
                        and float(value["weight"]) > previous["best_weight"]
                    ) or (
                        rm is not None
                        and previous["best_rm"] is not None
                        and rm > previous["best_rm"]
                    )
                updated = self.connection.execute(
                    """WITH updated AS (UPDATE public.gotore_workouts
                    SET exercises = %s, revision = revision + 1,
                    updated_at = clock_timestamp(), last_seen_at = clock_timestamp(),
                    feed_exercise = %s, feed_set = %s, feed_best = %s WHERE id = %s RETURNING *),
                    activity AS (INSERT INTO public.gotore_session_days (workout_id, day)
                        SELECT id, (last_seen_at AT TIME ZONE 'Asia/Tokyo')::date FROM updated
                        ON CONFLICT DO NOTHING)
                    SELECT * FROM updated""",
                    (Jsonb(exercises), ei, si, is_best, workout_id),
                ).fetchone()
                row = {**row, **updated}
            return self.with_shares(row)

    def finish(self, user_id: UUID, workout_id: UUID, revision: int):
        with self.connection.transaction():
            self.lock_workout(workout_id)
            row = self.session(user_id, workout_id)
            if row["ended_at"] is not None and row["revision"] == revision + 1:
                return self.with_shares(row)
            if row["revision"] != revision or row["ended_at"] is not None:
                raise Conflict("別の更新があります。保存済みを読み直してください")
            updated = self.connection.execute(
                """UPDATE public.gotore_workouts SET ended_at = clock_timestamp(),
                revision = revision + 1 WHERE id = %s RETURNING *""",
                (workout_id,),
            ).fetchone()
            return {**row, **updated}

    def heartbeat(self, user_id: UUID, workout_id: UUID):
        with self.connection.transaction():
            row = self.session(user_id, workout_id)
            if row["ended_at"] is not None:
                raise Conflict("トレーニングは終了しています")
            self.connection.execute(
                """WITH updated AS (UPDATE public.gotore_workouts
                SET last_seen_at = clock_timestamp() WHERE id = %s RETURNING id, last_seen_at)
                INSERT INTO public.gotore_session_days (workout_id, day)
                SELECT id, (last_seen_at AT TIME ZONE 'Asia/Tokyo')::date FROM updated
                ON CONFLICT DO NOTHING""",
                (workout_id,),
            )

    def bests(self, user_id: UUID, name: str):
        rows = self.connection.execute(
            """SELECT exercises FROM public.gotore_workouts
            WHERE user_id = %s AND exercises @> %s""",
            (user_id, Jsonb([{"name": name}])),
        ).fetchall()
        return personal_bests(
            [s for row in rows for e in row["exercises"] if e["name"] == name for s in e["sets"]]
        )

    def overview_bests(self, user_id: UUID, workout_id: UUID):
        row = self.session(user_id, workout_id)
        names = list({e["name"] for e in row["exercises"]})
        others = (
            self.connection.execute(
                """SELECT w.exercises FROM public.gotore_workouts w
            WHERE w.user_id = %s AND w.id != %s
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(w.exercises) e
                WHERE e->>'name' = ANY(%s::text[]))""",
                (user_id, workout_id, names),
            ).fetchall()
            if names
            else []
        )
        return {
            "revision": row["revision"],
            "sets": session_best_sets(
                row["exercises"], [e for other in others for e in other["exercises"]]
            ),
        }

    def preview(self, user_id: UUID, code: str):
        row = self.connection.execute(
            """SELECT g.id, g.name, (SELECT count(*) FROM public.gotore_group_members m
                WHERE m.group_id = g.id) AS member_count,
                EXISTS(SELECT 1 FROM public.gotore_group_members m
                WHERE m.group_id = g.id AND m.user_id = %s) AS already_member
            FROM public.gotore_groups g WHERE invite_code = %s""",
            (user_id, code),
        ).fetchone()
        if row is None:
            raise NotFound("コードを確認してください")
        return row

    def context(self, user_id: UUID, name: str, session_id: UUID | None):
        current = None
        if session_id:
            current = self.owned_workout(user_id, session_id)
            if current is None:
                raise NotFound("記録が見つかりません")
        rows = self.connection.execute(
            """SELECT w.id, w.performed_on, COALESCE(w.started_at, w.created_at) AS ordered_at,
                w.exercises FROM public.gotore_workouts w
            WHERE w.user_id = %s AND w.exercises @> %s
            ORDER BY w.performed_on DESC, COALESCE(w.started_at, w.created_at) DESC, w.id DESC""",
            (user_id, Jsonb([{"name": name}])),
        ).fetchall()
        sets = [s for row in rows for e in row["exercises"] if e["name"] == name for s in e["sets"]]
        previous = None
        for row in rows:
            if current and (row["performed_on"], row["ordered_at"], row["id"]) >= (
                current["performed_on"],
                current["started_at"] or current["created_at"],
                current["id"],
            ):
                continue
            previous = {
                "id": row["id"],
                "performed_on": row["performed_on"],
                "sets": [s for e in row["exercises"] if e["name"] == name for s in e["sets"]],
            }
            break
        memo = self.connection.execute(
            """SELECT content, revision FROM public.gotore_exercise_memos
            WHERE user_id = %s AND name = %s""",
            (user_id, name),
        ).fetchone() or {"content": "", "revision": 0}
        return {**personal_bests(sets), "previous": previous, "memo": memo}

    def save_exercise_memo(self, user_id: UUID, data: ExerciseMemoInput):
        with self.connection.transaction():
            self.connection.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 2))",
                (f"{user_id}:{data.name}",),
            )
            row = self.connection.execute(
                """SELECT content, revision FROM public.gotore_exercise_memos
                WHERE user_id = %s AND name = %s""",
                (user_id, data.name),
            ).fetchone() or {"content": "", "revision": 0}
            if row["revision"] != data.expected_revision:
                if row["revision"] == data.expected_revision + 1 and row["content"] == data.content:
                    return row
                raise Conflict("メモは変更済みです。読み直してください")
            if row["content"] == data.content:
                return row
            return self.connection.execute(
                """INSERT INTO public.gotore_exercise_memos (user_id, name, content, revision)
                VALUES (%s, %s, %s, %s) ON CONFLICT (user_id, name) DO UPDATE
                SET content = EXCLUDED.content, revision = EXCLUDED.revision
                RETURNING content, revision""",
                (user_id, data.name, data.content, row["revision"] + 1),
            ).fetchone()

    def group_activity(self, user_id: UUID, group_id: UUID):
        self.group(user_id, group_id)
        members = self.connection.execute(
            """SELECT p.id, p.display_name, m.joined_at,
            EXISTS(SELECT 1 FROM public.gotore_workouts w
              JOIN public.gotore_workout_shares s ON s.workout_id = w.id
              WHERE s.group_id = m.group_id AND w.user_id = m.user_id
              AND w.started_at IS NOT NULL AND w.ended_at IS NULL
              AND w.last_seen_at > clock_timestamp() - interval '5 minutes') AS live,
            EXISTS(SELECT 1 FROM public.gotore_workouts w
              WHERE w.user_id = m.user_id AND
              ((w.group_id = m.group_id AND
                w.performed_on = (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date)
               OR EXISTS(SELECT 1 FROM public.gotore_workout_shares s
                 JOIN public.gotore_session_days d ON d.workout_id = s.workout_id
                 WHERE s.workout_id = w.id AND s.group_id = m.group_id
                 AND d.day = (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date))) AS today
            FROM public.gotore_group_members m JOIN public.gotore_profiles p ON p.id = m.user_id
            WHERE m.group_id = %s ORDER BY live DESC, today DESC, m.joined_at, p.id""",
            (group_id,),
        ).fetchall()
        latest = self.connection.execute(
            """SELECT DISTINCT ON (w.user_id) w.*, p.display_name
            FROM public.gotore_workouts w JOIN public.gotore_profiles p ON p.id = w.user_id
            WHERE (w.group_id = %s OR EXISTS(SELECT 1 FROM public.gotore_workout_shares s
              WHERE s.workout_id = w.id AND s.group_id = %s))
              AND jsonb_array_length(w.exercises) > 0
            ORDER BY w.user_id, w.updated_at DESC, w.created_at DESC, w.id""",
            (group_id, group_id),
        ).fetchall()
        feed = []
        for row in latest:
            exercise = row["exercises"][
                row["feed_exercise"] if row["feed_exercise"] is not None else -1
            ]
            s = exercise["sets"][row["feed_set"] if row["feed_set"] is not None else -1]
            best = self.bests(row["user_id"], exercise["name"]) if row["feed_best"] else None
            rm = estimated_rm(s["weight"], s["reps"])
            feed.append(
                {
                    "workout_id": row["id"],
                    "user_id": row["user_id"],
                    "display_name": row["display_name"],
                    "exercise": exercise["name"],
                    "weight": s["weight"],
                    "reps": s["reps"],
                    "estimated_rm": rm,
                    "updated_at": row["updated_at"],
                    "best": best is not None
                    and (
                        (float(s["weight"]) > 0 and float(s["weight"]) == best["best_weight"])
                        or (rm is not None and rm == best["best_rm"])
                    ),
                }
            )
        feed.sort(key=lambda item: item["updated_at"], reverse=True)
        return {
            "group_id": group_id,
            "member_count": len(members),
            "live_count": sum(m["live"] for m in members),
            "today_count": sum(m["today"] for m in members),
            "members": members,
            "feed": feed,
        }
