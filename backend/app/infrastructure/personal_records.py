from psycopg import Connection

from app.domain.personal_records import record_best_sets


class PersonalRecordRepository:
    def __init__(self, connection: Connection):
        self.connection = connection

    def maxima(self, records: list[dict]) -> dict:
        pairs = {(row["user_id"], e["name"]) for row in records for e in row["exercises"]}
        if not pairs:
            return {}
        users, names = zip(*pairs)
        rows = self.connection.execute(
            """WITH wanted AS (
                SELECT * FROM unnest(%s::uuid[], %s::text[]) AS p(user_id, exercise_name)
            ) SELECT w.user_id, s.exercise_name,
                max(s.best_weight) AS best_weight, max(s.best_rm) AS best_rm
            FROM public.gotore_workout_statistics s
            JOIN public.gotore_workouts w ON w.id = s.workout_id
            JOIN wanted p ON p.user_id = w.user_id AND p.exercise_name = s.exercise_name
            GROUP BY w.user_id, s.exercise_name""",
            (list(users), list(names)),
        ).fetchall()
        return {(row["user_id"], row["exercise_name"]): row for row in rows}

    def attach(self, records: list[dict]) -> list[dict]:
        # 呼び出し側が認可済みの記録だけを渡す。比較元の私的な数値は応答へ載せない。
        pairs = {(row["user_id"], e["name"]) for row in records for e in row["exercises"]}
        if not pairs:
            return [{**row, "best_sets": []} for row in records]
        users, names = zip(*pairs)
        rows = self.connection.execute(
            """WITH wanted AS (
                SELECT * FROM unnest(%s::uuid[], %s::text[]) AS p(user_id, exercise_name)
            ), ranked AS (
                SELECT w.user_id, s.exercise_name, s.workout_id, s.best_weight, s.best_rm,
                    row_number() OVER (PARTITION BY w.user_id, s.exercise_name
                        ORDER BY s.best_weight DESC, s.workout_id) AS weight_rank,
                    row_number() OVER (PARTITION BY w.user_id, s.exercise_name
                        ORDER BY s.best_rm DESC NULLS LAST, s.workout_id) AS rm_rank
                FROM public.gotore_workout_statistics s
                JOIN public.gotore_workouts w ON w.id = s.workout_id
                JOIN wanted p ON p.user_id = w.user_id AND p.exercise_name = s.exercise_name
            ) SELECT user_id, exercise_name, workout_id, best_weight, best_rm
            FROM ranked WHERE weight_rank <= 2 OR rm_rank <= 2""",
            (list(users), list(names)),
        ).fetchall()
        grouped = {}
        for row in rows:
            grouped.setdefault((row["user_id"], row["exercise_name"]), []).append(row)
        result = []
        for record in records:
            baseline = {}
            for exercise in record["exercises"]:
                others = [
                    row
                    for row in grouped.get((record["user_id"], exercise["name"]), [])
                    if row["workout_id"] != record["id"]
                ]
                # 上位2記録を持てば、対象記録を除いた最高値も求められる。
                baseline[exercise["name"]] = {
                    metric: max(
                        (float(row[metric]) for row in others if row[metric] is not None),
                        default=None,
                    )
                    for metric in ("best_weight", "best_rm")
                }
            result.append({**record, "best_sets": record_best_sets(record["exercises"], baseline)})
        return result
