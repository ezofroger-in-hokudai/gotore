"""専用の空_test DBで全履歴JSON展開と集計表を比較し、保存への追加負荷を測る。"""

import argparse
import json
import os
import statistics
import sys
from datetime import date
from pathlib import Path
from time import perf_counter
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import psycopg  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402

from app.domain.analytics import analytics_window  # noqa: E402
from app.infrastructure.analytics import AnalyticsRepository  # noqa: E402
from app.infrastructure.training_repository import TrainingRepository  # noqa: E402


def measure(action, samples):
    action()
    values = []
    for _ in range(samples):
        start = perf_counter()
        action()
        values.append((perf_counter() - start) * 1000)
    return {
        "median_ms": round(statistics.median(values), 2),
        "p95_ms": round(sorted(values)[int((len(values) - 1) * 0.95)], 2),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=20)
    args = parser.parse_args()
    if not 5 <= args.samples <= 100:
        parser.error("samplesは5〜100")
    with psycopg.connect(
        os.environ["TEST_DATABASE_URL"], autocommit=True, row_factory=dict_row
    ) as conn:
        if not conn.info.dbname.endswith("_test"):
            raise ValueError("専用の空_test DBのみ使用してください")
        with conn.transaction(force_rollback=True):
            conn.execute("CREATE SCHEMA IF NOT EXISTS auth")
            conn.execute("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)")
            for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
                conn.execute(path.read_text())
            user = uuid4()
            conn.execute("INSERT INTO auth.users VALUES (%s)", (user,))
            conn.execute("INSERT INTO public.gotore_profiles VALUES (%s, '集計計測')", (user,))
            repo = AnalyticsRepository(TrainingRepository(conn))
            reports = []
            for count in [10, 100, 1000]:
                conn.execute("DELETE FROM public.gotore_workouts WHERE user_id = %s", (user,))
                exercises = [
                    {"name": f"種目{i}", "sets": [{"weight": 60, "reps": 10}] * 10}
                    for i in range(3)
                ]
                conn.execute(
                    """INSERT INTO public.gotore_workouts
                    (id, user_id, performed_on, exercises)
                    SELECT gen_random_uuid(), %s, DATE '2026-09-11' - (i %% 365), %s
                    FROM generate_series(1, %s) i""",
                    (user, Jsonb(exercises), count),
                )
                conn.execute("ANALYZE public.gotore_workouts")
                conn.execute("ANALYZE public.gotore_workout_statistics")
                direct_sql = """SELECT w.performed_on AS date, count(*) AS sets,
                    sum((s->>'weight')::numeric * (s->>'reps')::integer) AS volume
                    FROM public.gotore_workouts w
                    CROSS JOIN LATERAL jsonb_array_elements(w.exercises) e
                    CROSS JOIN LATERAL jsonb_array_elements(e->'sets') s
                    WHERE w.user_id = %s GROUP BY w.performed_on"""
                compact_sql = """SELECT w.performed_on AS date, sum(f.set_count) AS sets,
                    sum(f.volume) AS volume FROM public.gotore_workouts w
                    JOIN public.gotore_workout_statistics f ON f.workout_id = w.id
                    WHERE w.user_id = %s GROUP BY w.performed_on"""

                def fetch(sql):
                    return conn.execute(sql, (user,)).fetchall()

                assert sorted(fetch(direct_sql), key=lambda r: r["date"]) == sorted(
                    fetch(compact_sql), key=lambda r: r["date"]
                )
                result = {
                    "workouts": count,
                    "sets": count * 30,
                    "expand_json_sql": measure(lambda: fetch(direct_sql), args.samples),
                    "statistics_sql": measure(lambda: fetch(compact_sql), args.samples),
                }
                for period in ["month", "all"]:
                    window = analytics_window(period, 0, date(2026, 9, 11))
                    result[f"api_repository_{period}"] = measure(
                        lambda: repo.read(user, window, None), args.samples
                    )
                    result[f"response_{period}_bytes"] = len(
                        json.dumps(repo.read(user, window, None), default=str).encode()
                    )
                reports.append(result)
            workout = conn.execute("SELECT id FROM public.gotore_workouts LIMIT 1").fetchone()["id"]
            write = []
            for sets in [30, 600]:
                counter = 0

                def update():
                    nonlocal counter
                    counter += 1
                    data = [
                        {
                            "name": f"種目{i}",
                            "sets": [{"weight": 60 + counter % 2, "reps": 10}] * 30,
                        }
                        for i in range(sets // 30)
                    ]
                    conn.execute(
                        "UPDATE public.gotore_workouts SET exercises = %s WHERE id = %s",
                        (Jsonb(data), workout),
                    )

                enabled = measure(update, args.samples)
                # この専用DB内のロールバック対象だけで、集計なしの保存コストを比較する。
                with conn.transaction(force_rollback=True):
                    conn.execute(
                        "ALTER TABLE public.gotore_workouts "
                        "DISABLE TRIGGER gotore_statistics_update"
                    )
                    disabled = measure(update, args.samples)
                write.append(
                    {"sets": sets, "with_statistics": enabled, "without_statistics": disabled}
                )
            print(
                json.dumps(
                    {"samples": args.samples, "read": reports, "save": write},
                    ensure_ascii=False,
                    indent=2,
                )
            )


if __name__ == "__main__":
    main()
