import json
from dataclasses import asdict
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from app.domain.errors import Conflict, NotFound
from app.domain.score import (
    FORMULA_VERSION,
    ScoreWeights,
    consistency_score,
    intensity_score,
    summarize_exercises,
    total_score,
    volume_score,
)
from app.infrastructure.score_llm import EVALUATION_PROMPT, make_goal_input
from app.infrastructure.training_repository import TrainingRepository

PROMPT_VERSION = "goal-v1"


def json_value(value):
    return json.loads(json.dumps(value, default=str, ensure_ascii=False))


class ScoreRepository(TrainingRepository):
    def consume_ai_call(self, user_id: UUID, kind: str, limit: int):
        row = self.connection.execute(
            """INSERT INTO public.gotore_ai_usage (user_id, kind, day, calls)
            VALUES (%s, %s, (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date, 1)
            ON CONFLICT (user_id, kind) DO UPDATE SET day = EXCLUDED.day,
            calls = CASE WHEN gotore_ai_usage.day = EXCLUDED.day
                THEN gotore_ai_usage.calls + 1 ELSE 1 END
            WHERE gotore_ai_usage.day != EXCLUDED.day OR gotore_ai_usage.calls < %s
            RETURNING calls""",
            (user_id, kind, limit),
        ).fetchone()
        if row is None:
            raise Conflict("今日のAI利用上限に達しました。記録とスコアの内訳は利用できます")

    def claim(self, user_id: UUID, workout_id: UUID, model: str, daily_limit: int):
        with self.connection.transaction():
            self.lock_workout(workout_id)
            workout = self.owned_workout(user_id, workout_id)
            if workout is None:
                raise NotFound("記録が見つかりません")
            row = self.connection.execute(
                "SELECT * FROM public.gotore_workout_scores WHERE workout_id = %s FOR UPDATE",
                (workout_id,),
            ).fetchone()
            if row is None:
                raise NotFound("採点対象の記録がありません")
            if row["revision"] != workout["revision"]:
                raise Conflict("記録が変更されています。採点時の記録とは異なります")
            if row["status"] == "complete":
                return None
            claimed = self.connection.execute(
                """UPDATE public.gotore_workout_scores SET status = 'processing',
                lease_id = %s, lease_until = clock_timestamp() + interval '60 seconds',
                model = COALESCE(model, %s), attempts = attempts + 1,
                updated_at = clock_timestamp()
                WHERE workout_id = %s AND (lease_until IS NULL OR lease_until < clock_timestamp())
                RETURNING *""",
                (uuid4(), model, workout_id),
            ).fetchone()
            if claimed:
                self.consume_ai_call(user_id, "score", daily_limit)
            return claimed

    def complete(self, row, evaluation, model):
        with self.connection.transaction():
            self.lock_workout(row["workout_id"])
            components = {
                **row["components"],
                "g": str(evaluation["g"]) if evaluation["g"] is not None else None,
            }
            self.connection.execute(
                """UPDATE public.gotore_workout_scores s SET components = %s, goal_result = %s,
                model = %s, personal_total = %s, status = 'complete',
                lease_id = NULL, lease_until = NULL,
                updated_at = clock_timestamp() FROM public.gotore_workouts w
                WHERE s.workout_id = %s AND s.lease_id = %s AND w.id = s.workout_id
                AND w.revision = s.revision""",
                (
                    Jsonb(components),
                    Jsonb(json_value(evaluation)),
                    model,
                    total_score(
                        {k: Decimal(v) if v is not None else None for k, v in components.items()},
                        ScoreWeights(),
                    ),
                    row["workout_id"],
                    row["lease_id"],
                ),
            )

    def failed(self, row):
        self.connection.execute(
            """UPDATE public.gotore_workout_scores SET status = 'pending', lease_id = NULL,
            lease_until = NULL, updated_at = clock_timestamp()
            WHERE workout_id = %s AND lease_id = %s""",
            (row["workout_id"], row["lease_id"]),
        )

    def prepare(self, workout: dict, *, refresh=False):
        if not workout["exercises"] or workout["ended_at"] is None:
            return None
        day = workout["performed_on"]
        stats = summarize_exercises(workout["exercises"])
        # 採点の根拠を一括取得し、終了時のDB往復を2回の追加に抑える。
        source = self.connection.execute(
            """WITH goal AS (
                SELECT g.* FROM public.gotore_workout_goals p
                JOIN public.gotore_goal_versions g ON g.id = p.goal_id
                WHERE p.workout_id = %(id)s
            ), baseline AS (
                SELECT w.id, w.revision, w.performed_on,
                    jsonb_object_agg(s.exercise_name, jsonb_build_object(
                        'volume', s.volume::text, 'rm', s.best_rm::text,
                        'sets', s.set_count)) AS stats
                FROM public.gotore_workouts w
                JOIN public.gotore_workout_statistics s ON s.workout_id = w.id
                WHERE w.user_id = %(user)s AND w.performed_on BETWEEN %(from)s AND %(before)s
                    AND (w.started_at IS NULL OR w.ended_at IS NOT NULL)
                GROUP BY w.id
                HAVING array_agg(s.exercise_name ORDER BY s.exercise_name COLLATE "C")
                    = %(names)s::text[]
                ORDER BY sum(s.volume) DESC, w.performed_on DESC,
                    COALESCE(w.started_at, w.created_at) DESC, w.id DESC LIMIT 1
            ), history AS (
                SELECT w.performed_on, w.exercises FROM public.gotore_workouts w
                JOIN public.gotore_workout_goals p ON p.workout_id = w.id
                WHERE w.user_id = %(user)s AND p.goal_id = (SELECT id FROM goal)
                    AND w.id != %(id)s AND w.ended_at IS NOT NULL
                    AND jsonb_array_length(w.exercises) > 0
                    AND w.performed_on BETWEEN %(history_from)s AND %(day)s
                ORDER BY w.performed_on DESC, w.started_at DESC, w.id DESC LIMIT 61
            ) SELECT (SELECT to_jsonb(goal) FROM goal) AS goal,
                (SELECT to_jsonb(s) FROM public.gotore_workout_scores s
                    WHERE s.workout_id = %(id)s) AS prior,
                (SELECT to_jsonb(baseline) FROM baseline) AS baseline,
                (SELECT first_day FROM public.gotore_score_observations
                    WHERE user_id = %(user)s) AS first_day,
                ARRAY(SELECT DISTINCT performed_on FROM public.gotore_workouts
                    WHERE user_id = %(user)s AND performed_on BETWEEN %(activity_from)s AND %(day)s
                    AND jsonb_array_length(exercises) > 0
                    AND (started_at IS NULL OR ended_at IS NOT NULL)
                    ORDER BY performed_on) AS active_days,
                COALESCE((SELECT jsonb_agg(to_jsonb(history)) FROM history), '[]') AS history""",
            {
                "id": workout["id"],
                "user": workout["user_id"],
                "day": day,
                "from": day - timedelta(days=30),
                "before": day - timedelta(days=1),
                "activity_from": day - timedelta(days=27),
                "history_from": day - timedelta(days=29),
                "names": sorted(stats),
            },
        ).fetchone()
        pinned = source["goal"]
        if pinned is None:
            return None
        prior = source["prior"]
        if prior and (not refresh or prior["revision"] == workout["revision"]):
            return prior
        baseline = prior["snapshot"]["baseline"] if prior else source["baseline"]
        history = source["history"]
        snapshot = json_value(
            {
                "performed_on": day,
                "exercises": workout["exercises"],
                "baseline": baseline,
                "first_day": source["first_day"],
                "active_days": source["active_days"],
                "goal": pinned,
                "history": history[:60],
                "history_complete": len(history) <= 60,
            }
        )
        # 訂正で種目構成が変わった場合、元の基準回を別メニューへ流用しない。
        base = baseline["stats"] if baseline and set(baseline["stats"]) == set(stats) else {}
        components = {
            "c": consistency_score(day, source["first_day"], source["active_days"]),
            "i": intensity_score(
                {n: s.rm for n, s in stats.items()},
                {n: Decimal(s["rm"]) if s["rm"] is not None else None for n, s in base.items()},
            ),
            "v": volume_score(
                sum(s.volume for s in stats.values()),
                sum(Decimal(s["volume"]) for s in base.values()) if base else None,
            ),
            "g": None,
        }
        snapshot["statistics"] = json_value({n: asdict(s) for n, s in stats.items()})
        snapshot["llm_input"] = make_goal_input(snapshot)
        snapshot["llm_prompt"] = prior["snapshot"]["llm_prompt"] if prior else EVALUATION_PROMPT
        return self.connection.execute(
            """INSERT INTO public.gotore_workout_scores
            (workout_id, user_id, revision, goal_id, components, snapshot,
             formula_version, prompt_version)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (workout_id) DO UPDATE SET revision = EXCLUDED.revision,
                components = EXCLUDED.components, snapshot = EXCLUDED.snapshot,
                status = 'pending', personal_total = NULL, goal_result = NULL,
                lease_id = NULL, lease_until = NULL,
                updated_at = clock_timestamp()
            RETURNING *""",
            (
                workout["id"],
                workout["user_id"],
                workout["revision"],
                pinned["id"],
                Jsonb(json_value(components)),
                Jsonb(snapshot),
                FORMULA_VERSION,
                PROMPT_VERSION,
            ),
        ).fetchone()

    def weights(self, group_id: UUID | None, day: date):
        if group_id is None:
            return ScoreWeights(), 0
        row = self.connection.execute(
            """SELECT * FROM public.gotore_group_score_weights WHERE group_id = %s
            AND effective_on <= %s ORDER BY effective_on DESC, version DESC LIMIT 1""",
            (group_id, day),
        ).fetchone()
        return (
            (ScoreWeights(**{k: row[k] for k in ("c", "i", "v", "g")}), row["version"])
            if row
            else (ScoreWeights(), 0)
        )

    def present(
        self,
        row,
        workout_revision: int,
        group_id: UUID | None = None,
        private=False,
        resolved_weights=None,
    ):
        if row is None:
            return None
        snapshot = row.get("snapshot", {"performed_on": row.get("performed_on")})
        weights, version = resolved_weights or self.weights(
            group_id, date.fromisoformat(snapshot["performed_on"])
        )
        stale = row["revision"] != workout_revision
        components = {
            k: Decimal(v) if v is not None and not stale else None
            for k, v in row["components"].items()
        }
        result = {
            "workout_id": row["workout_id"],
            "revision": row["revision"],
            "total": total_score(components, weights),
            "components": {k: float(v) if v is not None else None for k, v in components.items()},
            "status": "stale" if stale else row["status"],
            "weights": weights.model_dump(),
            "weights_version": version,
            "scored_at": row["created_at"],
        }
        if private:
            result.update(
                {
                    "goal": snapshot["goal"],
                    "baseline": snapshot["baseline"],
                    "comment": None if stale else (row["goal_result"] or {}).get("comment"),
                    "judgments": [] if stale else (row["goal_result"] or {}).get("judgments", []),
                    "formula_version": row["formula_version"],
                    "model": row["model"],
                }
            )
        return result

    def get(self, user_id: UUID, workout_id: UUID, group_id: UUID | None = None):
        if group_id:
            workout = self.shared_workout(user_id, group_id, workout_id)
        else:
            workout = self.owned_workout(user_id, workout_id)
            if workout is None:
                raise NotFound("記録が見つかりません")
        row = self.connection.execute(
            "SELECT * FROM public.gotore_workout_scores WHERE workout_id = %s", (workout_id,)
        ).fetchone()
        return self.present(row, workout["revision"], group_id, private=group_id is None)

    def attach(self, records: list[dict], group_id: UUID | None = None):
        if not records:
            return records
        scores = self.connection.execute(
            """SELECT s.workout_id, s.revision, s.components, s.status, s.created_at,
                s.snapshot->>'performed_on' AS performed_on, to_jsonb(w) AS group_weights
            FROM public.gotore_workout_scores s LEFT JOIN LATERAL (
                SELECT c, i, v, g, version FROM public.gotore_group_score_weights
                WHERE group_id = %s AND effective_on <= (s.snapshot->>'performed_on')::date
                ORDER BY effective_on DESC, version DESC LIMIT 1
            ) w ON true WHERE s.workout_id = ANY(%s::uuid[])""",
            (group_id, [r["id"] for r in records]),
        ).fetchall()
        by_id = {s["workout_id"]: s for s in scores}

        def resolved(record):
            row = by_id.get(record["id"])
            if row is None:
                return None
            version = row["group_weights"]
            weights = (
                (ScoreWeights(**{k: version[k] for k in ("c", "i", "v", "g")}), version["version"])
                if version
                else (ScoreWeights(), 0)
            )
            return self.present(row, record["revision"], group_id, resolved_weights=weights)

        return [{**r, "score": resolved(r)} for r in records]

    def weights_settings(self, user_id: UUID, group_id: UUID, day: date):
        self.group(user_id, group_id)
        rows = self.connection.execute(
            """SELECT * FROM public.gotore_group_score_weights
            WHERE group_id = %s ORDER BY version DESC""",
            (group_id,),
        ).fetchall()
        current, version = self.weights(group_id, day)
        return {
            "current": current.model_dump(),
            "current_version": version,
            "latest_version": rows[0]["version"] if rows else 0,
            "scheduled": next((r for r in rows if r["effective_on"] > day), None),
        }

    def save_weights(
        self, user_id: UUID, group_id: UUID, weights: ScoreWeights, expected_version: int, day: date
    ):
        with self.connection.transaction():
            group = self.group(user_id, group_id)
            if group["owner_id"] != user_id:
                raise NotFound("グループが見つかりません")
            self.connection.execute(
                "SELECT id FROM public.gotore_groups WHERE id = %s FOR UPDATE", (group_id,)
            )
            current = self.weights_settings(user_id, group_id, day)
            if current["latest_version"] != expected_version:
                raise Conflict("配点が変更されています。読み直してください")
            effective = day + timedelta(days=7 - day.weekday())
            self.connection.execute(
                """INSERT INTO public.gotore_group_score_weights
                (group_id, version, effective_on, c, i, v, g)
                VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (
                    group_id,
                    expected_version + 1,
                    effective,
                    weights.c,
                    weights.i,
                    weights.v,
                    weights.g,
                ),
            )
            return self.weights_settings(user_id, group_id, day)
