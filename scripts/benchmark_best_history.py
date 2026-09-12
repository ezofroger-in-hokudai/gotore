"""専用の空テストDBで、履歴件数ごとのBEST/前回取得量・SQL・実行計画を比較する。"""

import argparse
import json
import os
import statistics
import subprocess
import sys
from pathlib import Path
from time import perf_counter
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import psycopg  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402

from app.domain.session import SessionUpdate  # noqa: E402
from app.infrastructure.sessions import SessionRepository  # noqa: E402


class MeasuredCursor:
    def __init__(self, cursor, owner):
        self.cursor = cursor
        self.owner = owner

    def measure(self, result):
        # wire形式ではなく、Pythonへ取得した結果のJSON再直列化サイズを比較する。
        self.owner.bytes += len(json.dumps(result, default=str).encode())
        return result

    def fetchone(self):
        return self.measure(self.cursor.fetchone())

    def fetchall(self):
        return self.measure(self.cursor.fetchall())


class MeasuredConnection:
    def __init__(self, connection):
        self.connection = connection
        self.queries = []
        self.bytes = 0

    def execute(self, query, params=None):
        self.queries.append((query, params))
        return MeasuredCursor(self.connection.execute(query, params), self)

    def transaction(self):
        return self.connection.transaction()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", default="9a3b66b")
    parser.add_argument("--samples", type=int, default=5)
    parser.add_argument("--plans", type=Path)
    args = parser.parse_args()
    if args.samples < 2:
        parser.error("samplesは2以上")
    namespace = {}
    source = subprocess.check_output(
        ["git", "show", f"{args.baseline}:backend/app/infrastructure/sessions.py"],
        cwd=ROOT,
        text=True,
    )
    exec(compile(source, "baseline_sessions", "exec"), namespace)
    report, plans = [], []
    with psycopg.connect(
        os.environ["TEST_DATABASE_URL"],
        autocommit=True,
        row_factory=dict_row,
    ) as connection:
        if not connection.info.dbname.endswith("_test"):
            raise ValueError("専用の_test DBのみ使用できます")
        if connection.execute(
            "SELECT to_regclass('public.gotore_workouts') AS existing"
        ).fetchone()["existing"]:
            raise ValueError("アプリのテーブルがない専用DBを指定してください")
        with connection.transaction(force_rollback=True):
            connection.execute("CREATE SCHEMA IF NOT EXISTS auth")
            connection.execute("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)")
            for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
                connection.execute(path.read_text())
            for count in [10, 100, 1000]:
                with connection.transaction(force_rollback=True):
                    users = [uuid4() for _ in range(3)]
                    for user in users:
                        connection.execute("INSERT INTO auth.users (id) VALUES (%s)", (user,))
                        connection.execute(
                            "INSERT INTO public.gotore_profiles (id, display_name) "
                            "VALUES (%s, '比較用')",
                            (user,),
                        )
                        connection.execute(
                            """INSERT INTO public.gotore_workouts
                                (id, user_id, performed_on, exercises)
                            SELECT gen_random_uuid(), %s, '2020-01-01'::date + i, %s
                            FROM generate_series(1, %s) i""",
                            (
                                user,
                                Jsonb(
                                    [
                                        {
                                            "name": f"種目{i}",
                                            "sets": [{"weight": 80, "reps": 8}] * 3,
                                        }
                                        for i in range(1, 6)
                                    ]
                                ),
                                count,
                            ),
                        )
                    setup = SessionRepository(connection)
                    group = setup.create_group(users[0], "比較用")
                    sessions = []
                    for user in users:
                        connection.execute(
                            """INSERT INTO public.gotore_group_members (group_id, user_id)
                            VALUES (%s, %s) ON CONFLICT DO NOTHING""",
                            (group["id"], user),
                        )
                        session = setup.start(user, uuid4())
                        for revision, weights in [(1, [80]), (2, [80, 85])]:
                            session = setup.save_session(
                                user,
                                session["id"],
                                SessionUpdate(
                                    expected_revision=revision,
                                    exercises=[
                                        {
                                            "name": "種目1",
                                            "sets": [{"weight": w, "reps": 8} for w in weights],
                                        }
                                    ],
                                ),
                            )
                        sessions.append(session)
                    connection.execute("ANALYZE public.gotore_workouts")
                    connection.execute("ANALYZE public.gotore_workout_statistics")
                    for version, repository in [
                        ("before", namespace["SessionRepository"]),
                        ("after", SessionRepository),
                    ]:
                        measured = MeasuredConnection(connection)
                        repo = repository(measured)
                        session = sessions[0]
                        actions = {
                            "bests": lambda: repo.bests(users[0], "種目1"),
                            "context": lambda: repo.context(users[0], "種目1", session["id"]),
                            "overview": lambda: repo.overview_bests(users[0], session["id"]),
                            "best_feed": lambda: repo.group_activity(users[0], group["id"]),
                            "ordinary_feed": lambda: repo.group_activity(users[0], group["id"]),
                            "save": lambda: repo.save_session(
                                users[0],
                                session["id"],
                                SessionUpdate(
                                    expected_revision=session["revision"],
                                    exercises=[
                                        {
                                            "name": "種目1",
                                            "sets": [
                                                {"weight": w, "reps": 8} for w in [80, 85, 87.5]
                                            ],
                                        }
                                    ],
                                ),
                            ),
                        }
                        for operation, action in actions.items():
                            samples = []
                            for sample in range(args.samples + 1):
                                with connection.transaction(force_rollback=True):
                                    if operation == "ordinary_feed":
                                        connection.execute(
                                            "UPDATE public.gotore_workouts SET feed_best = false "
                                            "WHERE started_at IS NOT NULL"
                                        )
                                    measured.queries, measured.bytes = [], 0
                                    started = perf_counter()
                                    action()
                                    elapsed = (perf_counter() - started) * 1000
                                    if sample:
                                        samples.append(
                                            (elapsed, len(measured.queries), measured.bytes)
                                        )
                                    if (
                                        args.plans
                                        and sample == args.samples
                                        and operation != "save"
                                    ):
                                        for index, (query, params) in enumerate(measured.queries):
                                            if query.lstrip().upper().startswith("SELECT"):
                                                plan = connection.execute(
                                                    "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "
                                                    + query,
                                                    params,
                                                ).fetchone()
                                                plans.append(
                                                    {
                                                        "records_per_user": count,
                                                        "version": version,
                                                        "operation": operation,
                                                        "query": index,
                                                        "plan": plan,
                                                    }
                                                )
                            report.append(
                                {
                                    "records_per_user": count,
                                    "version": version,
                                    "operation": operation,
                                    "median_ms": round(statistics.median(v[0] for v in samples), 2),
                                    "sql_calls": sorted({v[1] for v in samples}),
                                    "result_json_bytes": int(
                                        statistics.median(v[2] for v in samples)
                                    ),
                                }
                            )
    if args.plans:
        args.plans.write_text(json.dumps(plans, default=str, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
