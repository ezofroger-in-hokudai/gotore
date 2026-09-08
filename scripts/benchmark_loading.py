"""専用DBと遅延付きローカルAuthで、継続読み込みの方式を比較する。"""

import argparse
import json
import os
import statistics
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from time import perf_counter, sleep
from types import SimpleNamespace
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import httpx  # noqa: E402
import psycopg  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402

from app.api.dependencies import auth_client, database  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.infrastructure.training_repository import TrainingRepository  # noqa: E402
from app.main import app  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", default="217c63c6ba83dcf857cc6f1d06346cbbc480efb8")
    parser.add_argument("--samples", type=int, default=8)
    args = parser.parse_args()
    if args.samples < 2:
        parser.error("samplesは2以上")
    url = os.environ["TEST_DATABASE_URL"]
    user_id = uuid4()
    connection_count = 0

    class AuthHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def setup(self):
            nonlocal connection_count
            super().setup()
            connection_count += 1
            sleep(0.06)

        def do_GET(self):
            sleep(0.02)
            body = json.dumps(
                {"id": str(user_id), "user_metadata": {"display_name": "比較用"}}
            ).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), AuthHandler)
    server.daemon_threads = True
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    settings.supabase_url = f"http://127.0.0.1:{server.server_port}"
    settings.supabase_anon_key = "benchmark-public-key"
    baseline = {}
    source = subprocess.check_output(
        [
            "git",
            "show",
            f"{args.baseline}:backend/app/infrastructure/training_repository.py",
        ],
        cwd=ROOT,
        text=True,
    )
    exec(compile(source, "baseline_repository", "exec"), baseline)
    original_profile = TrainingRepository.profile
    report = []
    try:
        with psycopg.connect(url, autocommit=True, row_factory=dict_row) as connection:
            if not connection.info.dbname.endswith("_test"):
                raise ValueError("専用の_test DBだけを使用してください")
            with connection.transaction(force_rollback=True):
                connection.execute("CREATE SCHEMA IF NOT EXISTS auth")
                connection.execute("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)")
                for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
                    connection.execute(path.read_text())
                connection.execute("INSERT INTO auth.users VALUES (%s)", (user_id,))
                connection.execute(
                    "INSERT INTO public.gotore_profiles (id, display_name) VALUES (%s, '比較用')",
                    (user_id,),
                )
                connection.execute(
                    """INSERT INTO public.gotore_workouts (id, user_id, performed_on, exercises)
                    SELECT gen_random_uuid(), %s, CURRENT_DATE,
                    '[{"name":"スクワット","sets":[{"weight":20,"reps":10}]}]'::jsonb
                    FROM generate_series(1, 10)""",
                    (user_id,),
                )
                statements = 0

                class DelayedConnection:
                    def execute(self, *args, **kwargs):
                        nonlocal statements
                        statements += 1
                        sleep(0.04)
                        return connection.execute(*args, **kwargs)

                app.dependency_overrides[database] = lambda: DelayedConnection()
                for reuse, read_first in [
                    (False, False),
                    (True, False),
                    (False, True),
                    (True, True),
                ]:
                    TrainingRepository.profile = (
                        original_profile if read_first else baseline["TrainingRepository"].profile
                    )
                    app.dependency_overrides.pop(auth_client, None)
                    if not reuse:
                        app.dependency_overrides[auth_client] = lambda: SimpleNamespace(
                            get=httpx.get
                        )
                    samples = []
                    query_counts = []
                    connects_before = connection_count
                    with TestClient(app) as client:
                        for i in range(args.samples + 1):
                            statements = 0
                            start = perf_counter()
                            response = client.get(
                                "/api/workouts",
                                headers={"Authorization": "Bearer benchmark-token"},
                            )
                            duration = (perf_counter() - start) * 1000
                            assert response.status_code == 200, response.text
                            assert len(response.json()) == 10
                            if i:
                                samples.append(round(duration, 1))
                                query_counts.append(statements)
                    report.append(
                        {
                            "reuse_http": reuse,
                            "read_profile_first": read_first,
                            "samples_ms": samples,
                            "median_ms": round(statistics.median(samples), 1),
                            "sql_per_request": query_counts,
                            "auth_connections_including_warmup": connection_count - connects_before,
                        }
                    )
    finally:
        TrainingRepository.profile = original_profile
        app.dependency_overrides.clear()
        server.shutdown()
        server.server_close()
        thread.join()
    print(
        json.dumps(
            {
                "environment": "local API + test PostgreSQL + delayed Auth; not production",
                "injected_ms": {
                    "auth_connection": 60,
                    "auth_response": 20,
                    "each_sql": 40,
                },
                "records": 10,
                "warmup_per_variant": 1,
                "results": report,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
