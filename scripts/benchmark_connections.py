"""専用DBで、新規接続と接続プールの初回・継続取得を比較する。"""

import argparse
import json
import os
import statistics
import sys
from pathlib import Path
from time import perf_counter, sleep

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import psycopg  # noqa: E402

from app.infrastructure.database_pool import create_database_pool  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=8)
    parser.add_argument("--connect-delay-ms", type=float, default=120)
    parser.add_argument("--sql-delay-ms", type=float, default=40)
    args = parser.parse_args()
    if args.samples < 2 or min(args.connect_delay_ms, args.sql_delay_ms) < 0:
        parser.error("samplesは2以上、遅延は0以上")
    url = os.environ["TEST_DATABASE_URL"]
    if not psycopg.conninfo.conninfo_to_dict(url).get("dbname", "").endswith("_test"):
        raise ValueError("専用の_test DBだけを使用してください")

    class DelayedConnection(psycopg.Connection):
        opened = 0

        @classmethod
        def connect(cls, *values, **kwargs):
            cls.opened += 1
            sleep(args.connect_delay_ms / 1000)
            return super().connect(*values, **kwargs)

        def execute(self, *values, **kwargs):
            sleep(args.sql_delay_ms / 1000)
            return super().execute(*values, **kwargs)

    report = []
    pool = create_database_pool(url, 4)
    pool.connection_class = DelayedConnection
    with pool:
        for label in ["new_connection", "pool"]:
            before = DelayedConnection.opened
            elapsed = []
            for _ in range(args.samples + 1):
                started = perf_counter()
                context = (
                    pool.connection()
                    if label == "pool"
                    else DelayedConnection.connect(url, **pool.kwargs)
                )
                with context as connection:
                    assert (
                        connection.execute("SELECT 1 AS value").fetchone()["value"] == 1
                    )
                elapsed.append((perf_counter() - started) * 1000)
            report.append(
                {
                    "mode": label,
                    "cold_ms": round(elapsed[0], 1),
                    "warm_median_ms": round(statistics.median(elapsed[1:]), 1),
                    "connections": DelayedConnection.opened - before,
                    "requests": len(elapsed),
                }
            )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
