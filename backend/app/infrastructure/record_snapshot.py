from uuid import UUID

from psycopg import Connection

from app.infrastructure.exercise_catalog import ExerciseCatalogRepository
from app.infrastructure.sessions import SessionRepository
from app.schemas.record_snapshot import RecordManifest


class RecordSnapshotRepository:
    def __init__(self, connection: Connection):
        self.connection = connection

    def read(self, user_id: UUID):
        # 一度の読み取りトランザクションで全件を取得し、削除や追加をページ間で取りこぼさない。
        workouts = self.connection.execute(
            """SELECT w.*, p.display_name, a.version AS avatar_version,
            ARRAY(SELECT s.group_id FROM public.gotore_workout_shares s
                WHERE s.workout_id = w.id ORDER BY s.group_id) AS shared_group_ids
            FROM public.gotore_workouts w
            JOIN public.gotore_profiles p ON p.id = w.user_id
            LEFT JOIN public.gotore_avatars a ON a.user_id = w.user_id
            WHERE w.user_id = %s
            ORDER BY w.performed_on DESC, w.created_at DESC, w.id""",
            (user_id,),
        ).fetchall()
        sessions = SessionRepository(self.connection)
        options = ExerciseCatalogRepository(self.connection).options(user_id)
        names = {option["name"] for option in options}
        names.update(exercise["name"] for row in workouts for exercise in row["exercises"])
        names.update(
            row["name"]
            for row in self.connection.execute(
                "SELECT name FROM public.gotore_exercise_memos WHERE user_id = %s", (user_id,)
            ).fetchall()
        )
        active = next(
            (row["id"] for row in workouts if row["started_at"] and not row["ended_at"]), None
        )
        contexts = {name: sessions.context(user_id, name, active) for name in sorted(names)}
        workout_memos = self.connection.execute(
            """SELECT m.workout_id, m.content, m.revision
            FROM public.gotore_workout_memos m
            JOIN public.gotore_workouts w ON w.id = m.workout_id
            WHERE w.user_id = %s""",
            (user_id,),
        ).fetchall()
        session_memos = self.connection.execute(
            """SELECT m.workout_id, m.name, m.content, m.revision
            FROM public.gotore_session_exercise_memos m
            JOIN public.gotore_workouts w ON w.id = m.workout_id
            WHERE w.user_id = %s""",
            (user_id,),
        ).fetchall()
        session_memos_by_workout = {}
        for row in session_memos:
            session_memos_by_workout.setdefault(str(row["workout_id"]), {})[row["name"]] = {
                "content": row["content"],
                "revision": row["revision"],
            }
        return {
            "user_id": user_id,
            "workouts": sessions.with_bests(workouts),
            "options": options,
            "contexts": contexts,
            "workout_memos": {str(row["workout_id"]): row for row in workout_memos},
            "session_exercise_memos": session_memos_by_workout,
        }

    def changes(self, user_id: UUID, manifest: RecordManifest):
        # 端末の版一覧と軽量なDB側の版一覧を比較し、本文は変更分だけ読む。
        heads = self.connection.execute(
            """SELECT w.id, w.revision, w.started_at, w.ended_at,
                ARRAY(SELECT e.value->>'name'
                    FROM jsonb_array_elements(w.exercises) e(value)) AS names,
                ARRAY(SELECT s.group_id FROM public.gotore_workout_shares s
                    WHERE s.workout_id = w.id ORDER BY s.group_id) AS shared_group_ids
            FROM public.gotore_workouts w WHERE w.user_id = %s""",
            (user_id,),
        ).fetchall()
        current = {row["id"]: row for row in heads}
        previous = {row.id: row for row in manifest.workouts}
        deleted_workout_ids = sorted(previous.keys() - current.keys())
        body_changed_ids = {
            row["id"]
            for row in heads
            if row["id"] not in previous
            or row["revision"] != previous[row["id"]].revision
        }
        changed_ids = body_changed_ids | {
            row["id"]
            for row in heads
            if row["id"] in previous
            and row["shared_group_ids"] != sorted(previous[row["id"]].shared_group_ids)
        }
        best_affected = set()
        for workout_id in body_changed_ids | set(deleted_workout_ids):
            if workout_id in previous:
                best_affected.update(previous[workout_id].names)
            if workout_id in current:
                best_affected.update(current[workout_id]["names"])
        affected = set(best_affected)

        options = ExerciseCatalogRepository(self.connection).options(user_id)
        current_options = {row["id"]: row for row in options}
        previous_options = {row.id: row for row in manifest.options}
        deleted_option_ids = sorted(previous_options.keys() - current_options.keys())
        changed_options = [
            row
            for row in options
            if row["id"] not in previous_options
            or row["revision"] != previous_options[row["id"]].revision
            or row["name"] != previous_options[row["id"]].name
        ]
        affected.update(row["name"] for row in changed_options)
        affected.update(previous_options[option_id].name for option_id in deleted_option_ids)

        exercise_memos = self.connection.execute(
            "SELECT name, revision FROM public.gotore_exercise_memos WHERE user_id = %s",
            (user_id,),
        ).fetchall()
        affected.update(
            row["name"]
            for row in exercise_memos
            if manifest.contexts.get(row["name"], 0) != row["revision"]
        )
        all_names = {row["name"] for row in options}
        all_names.update(name for row in heads for name in row["names"])
        all_names.update(row["name"] for row in exercise_memos)
        deleted_context_names = sorted(manifest.contexts.keys() - all_names)
        affected.update(all_names - manifest.contexts.keys())
        affected.intersection_update(all_names)

        active = next(
            (row["id"] for row in heads if row["started_at"] and not row["ended_at"]), None
        )
        if active != manifest.active_workout_id:
            affected.update(all_names)
            if manifest.active_workout_id in current:
                changed_ids.add(manifest.active_workout_id)
            if active in current:
                changed_ids.add(active)

        # BEST表示は別の記録の追加・削除でも変わる。旧BESTと新しい上位候補を再取得する。
        if best_affected:
            changed_ids.update(
                row.id
                for row in manifest.workouts
                if row.has_best and set(row.names) & best_affected and row.id in current
            )
            best_rows = self.connection.execute(
                """WITH ranked AS (
                    SELECT s.workout_id,
                        row_number() OVER (PARTITION BY s.exercise_name
                            ORDER BY s.best_weight DESC NULLS LAST, s.workout_id) AS weight_rank,
                        row_number() OVER (PARTITION BY s.exercise_name
                            ORDER BY s.best_rm DESC NULLS LAST, s.workout_id) AS rm_rank
                    FROM public.gotore_workout_statistics s
                    JOIN public.gotore_workouts w ON w.id = s.workout_id
                    WHERE w.user_id = %s AND s.exercise_name = ANY(%s::text[])
                ) SELECT DISTINCT workout_id FROM ranked
                WHERE weight_rank <= 2 OR rm_rank <= 2""",
                (user_id, sorted(best_affected)),
            ).fetchall()
            changed_ids.update(row["workout_id"] for row in best_rows)

        workouts = []
        if changed_ids:
            rows = self.connection.execute(
                """SELECT w.*, p.display_name, a.version AS avatar_version,
                    ARRAY(SELECT s.group_id FROM public.gotore_workout_shares s
                        WHERE s.workout_id = w.id ORDER BY s.group_id) AS shared_group_ids
                FROM public.gotore_workouts w
                JOIN public.gotore_profiles p ON p.id = w.user_id
                LEFT JOIN public.gotore_avatars a ON a.user_id = w.user_id
                WHERE w.user_id = %s AND w.id = ANY(%s::uuid[])
                ORDER BY w.performed_on DESC, w.created_at DESC, w.id""",
                (user_id, list(changed_ids)),
            ).fetchall()
            workouts = SessionRepository(self.connection).with_bests(rows)

        contexts = {
            name: SessionRepository(self.connection).context(user_id, name, active)
            for name in sorted(affected)
        }
        workout_memos = self.connection.execute(
            """SELECT m.workout_id, m.content, m.revision FROM public.gotore_workout_memos m
            JOIN public.gotore_workouts w ON w.id = m.workout_id WHERE w.user_id = %s""",
            (user_id,),
        ).fetchall()
        memo_ids = {row["workout_id"] for row in workout_memos}
        changed_workout_memos = {
            str(row["workout_id"]): row
            for row in workout_memos
            if manifest.workout_memos.get(row["workout_id"]) != row["revision"]
        }
        session_memos = self.connection.execute(
            """SELECT m.workout_id, m.name, m.content, m.revision
            FROM public.gotore_session_exercise_memos m
            JOIN public.gotore_workouts w ON w.id = m.workout_id WHERE w.user_id = %s""",
            (user_id,),
        ).fetchall()
        session_keys = {(row["workout_id"], row["name"]) for row in session_memos}
        changed_session_memos = {}
        for row in session_memos:
            previous_revision = manifest.session_exercise_memos.get(row["workout_id"], {}).get(
                row["name"]
            )
            if previous_revision != row["revision"]:
                changed_session_memos.setdefault(str(row["workout_id"]), {})[row["name"]] = row
        deleted_session_memos = {}
        for workout_id, memos in manifest.session_exercise_memos.items():
            missing = sorted(name for name in memos if (workout_id, name) not in session_keys)
            if missing:
                deleted_session_memos[str(workout_id)] = missing
        return {
            "user_id": user_id,
            "workouts": workouts,
            "deleted_workout_ids": deleted_workout_ids,
            "options": changed_options,
            "deleted_option_ids": deleted_option_ids,
            "contexts": contexts,
            "deleted_context_names": deleted_context_names,
            "workout_memos": changed_workout_memos,
            "deleted_workout_memo_ids": sorted(manifest.workout_memos.keys() - memo_ids),
            "session_exercise_memos": changed_session_memos,
            "deleted_session_exercise_memos": deleted_session_memos,
        }
