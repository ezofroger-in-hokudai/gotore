"""専用の空_test DBでSCORE付き終了・保存済み採点の読み取りを計測する。"""

import json
import os
from datetime import date
from uuid import uuid4

from benchmark_analytics import ROOT, measure
from psycopg import connect
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.domain.session import SessionUpdate
from app.infrastructure.goals import GoalRepository
from app.infrastructure.scores import ScoreRepository
from app.infrastructure.sessions import SessionRepository


def main():
    with connect(
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
            conn.execute(
                "INSERT INTO public.gotore_profiles VALUES (%s, '採点計測')", (user,)
            )
            goal = GoalRepository(conn).current(user)
            exercises = [
                {"name": f"種目{i}", "sets": [{"weight": 60, "reps": 10}] * 10}
                for i in range(3)
            ]
            conn.execute(
                """INSERT INTO public.gotore_workouts
                (id, user_id, performed_on, exercises, started_at, ended_at, last_seen_at)
                SELECT gen_random_uuid(), %s, %s::date - (i %% 365), %s,
                    clock_timestamp() - interval '1 hour', clock_timestamp(), clock_timestamp()
                FROM generate_series(1, 1000) i""",
                (user, date.today(), Jsonb(exercises)),
            )
            conn.execute(
                """INSERT INTO public.gotore_workout_goals (workout_id, user_id, goal_id)
                SELECT id, user_id, %s FROM public.gotore_workouts WHERE user_id = %s""",
                (goal["id"], user),
            )
            conn.execute("ANALYZE public.gotore_workouts")
            conn.execute("ANALYZE public.gotore_workout_statistics")
            sessions = SessionRepository(conn)
            scores = ScoreRepository(conn)
            record = sessions.start(user, uuid4())
            record = sessions.save_session(
                user,
                record["id"],
                SessionUpdate(
                    expected_revision=record["revision"], exercises=exercises
                ),
            )

            def finish():
                with conn.transaction(force_rollback=True):
                    sessions.finish(user, record["id"], record["revision"])

            report = {
                "workouts": 1000,
                "sets": 30000,
                "samples": 20,
                "finish_with_score": measure(finish, 20),
            }
            sessions.finish(user, record["id"], record["revision"])
            report["private_score_read"] = measure(
                lambda: scores.get(user, record["id"]), 20
            )
            records = scores.workouts(user, None, 50, 0, None, None, None)
            report["attach_50_summaries"] = measure(lambda: scores.attach(records), 20)
            print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
