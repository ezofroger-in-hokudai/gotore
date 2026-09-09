"""専用の空DBで、セッション操作のSQL往復と遅延付き所要時間を比較する。"""

import argparse
import json
import os
import statistics
import subprocess
import sys
from pathlib import Path
from time import perf_counter, sleep
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import psycopg  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402

from app.domain.session import SessionUpdate  # noqa: E402
from app.infrastructure.sessions import SessionRepository  # noqa: E402


class DelayedConnection:
    def __init__(self, connection, delay):
        self.connection = connection
        self.delay = delay
        self.calls = 0

    def execute(self, *args, **kwargs):
        self.calls += 1
        sleep(self.delay)
        return self.connection.execute(*args, **kwargs)

    def transaction(self):
        return self.connection.transaction()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", default="aba5bc3")
    parser.add_argument("--samples", type=int, default=8)
    parser.add_argument("--sql-delay-ms", type=float, default=40)
    args = parser.parse_args()
    if args.samples < 2 or args.sql_delay_ms < 0:
        parser.error("samplesは2以上、sql-delay-msは0以上")
    namespace = {}
    source = subprocess.check_output(
        ["git", "show", f"{args.baseline}:backend/app/infrastructure/sessions.py"],
        cwd=ROOT,
        text=True,
    )
    exec(compile(source, "baseline_sessions", "exec"), namespace)
    report = []
    with psycopg.connect(
        os.environ["TEST_DATABASE_URL"], autocommit=True, row_factory=dict_row
    ) as connection:
        if not connection.info.dbname.endswith("_test"):
            raise ValueError("専用の_test DBだけを使用してください")
        with connection.transaction(force_rollback=True):
            connection.execute("CREATE SCHEMA IF NOT EXISTS auth")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)"
            )
            for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
                connection.execute(path.read_text())
            users = [uuid4() for _ in range(3)]
            for user in users:
                connection.execute("INSERT INTO auth.users (id) VALUES (%s)", (user,))
                connection.execute(
                    "INSERT INTO public.gotore_profiles (id, display_name) VALUES (%s, '比較用')",
                    (user,),
                )
            setup = SessionRepository(connection)
            groups = [setup.create_group(users[0], "比較用") for _ in range(4)]
            for user in users[1:]:
                for group in groups:
                    connection.execute(
                        """INSERT INTO public.gotore_group_members (group_id, user_id)
                        VALUES (%s, %s)""",
                        (group["id"], user),
                    )
                session = setup.start(user, uuid4())
                setup.save_session(
                    user,
                    session["id"],
                    SessionUpdate(expected_revision=1, exercises=exercises()),
                )
            for label, repository in [
                ("before", namespace["SessionRepository"]),
                ("after", SessionRepository),
            ]:
                samples = {
                    name: []
                    for name in ["start", "save", "heartbeat", "finish", "feed"]
                }
                counted = DelayedConnection(connection, args.sql_delay_ms / 1000)
                repo = repository(counted)

                def measure(name, action, sample):
                    counted.calls = 0
                    started = perf_counter()
                    result = action()
                    elapsed = (perf_counter() - started) * 1000
                    if sample:
                        samples[name].append((elapsed, counted.calls))
                    return result

                for sample in range(args.samples + 1):
                    with connection.transaction(force_rollback=True):
                        session = measure(
                            "start", lambda: repo.start(users[0], uuid4()), sample
                        )
                        session = measure(
                            "save",
                            lambda: repo.save_session(
                                users[0],
                                session["id"],
                                SessionUpdate(
                                    expected_revision=1, exercises=exercises()
                                ),
                            ),
                            sample,
                        )
                        measure(
                            "heartbeat",
                            lambda: repo.heartbeat(users[0], session["id"]),
                            sample,
                        )
                        measure(
                            "finish",
                            lambda: repo.finish(users[0], session["id"], 2),
                            sample,
                        )
                        measure(
                            "feed",
                            lambda: repo.group_activity(users[0], groups[0]["id"]),
                            sample,
                        )
                for name, values in samples.items():
                    report.append(
                        {
                            "version": label,
                            "operation": name,
                            "median_ms": round(
                                statistics.median(v[0] for v in values), 1
                            ),
                            "sql_calls": sorted({v[1] for v in values}),
                        }
                    )
    print(json.dumps(report, indent=2))


def exercises():
    return [{"name": "ベンチプレス", "sets": [{"weight": 80, "reps": 8}]}]


if __name__ == "__main__":
    main()
