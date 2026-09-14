from datetime import date

import pytest

from app.infrastructure.score_llm import ScoreLLM
from tests.test_sessions import save as save_response
from tests.test_sessions import start
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture
from tests.test_sharing import create_group

client = client_fixture
connection = connection_fixture


def save(client, record):
    response = save_response(client, record)
    assert response.status_code == 200, response.text
    return response.json()


def finish(client, record):
    response = client.post(
        f"/api/sessions/{record['id']}/finish", json={"expected_revision": record["revision"]}
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_training_does_not_prepare_scores_or_goals(client, connection, monkeypatch):
    def unexpected(*args, **kwargs):
        pytest.fail("停止中のAI機能を呼び出しました")

    monkeypatch.setattr(ScoreLLM, "evaluate", unexpected)
    monkeypatch.setattr(ScoreLLM, "propose", unexpected)
    group = create_group(client)
    saved = save(client, start(client))
    record = finish(client, saved)
    assert finish(client, saved)["id"] == record["id"]
    response = client.patch(
        f"/api/workouts/{record['id']}",
        json={
            "expected_revision": record["revision"],
            "performed_on": record["performed_on"],
            "exercises": [{"name": "ベンチプレス", "sets": [{"weight": 30, "reps": 10}]}],
        },
    )
    assert response.status_code == 200, response.text
    for result in [record, response.json(), *client.get("/api/workouts").json()]:
        assert result.get("score") is None
    for method, path in [
        ("GET", "/me/goal"),
        ("PUT", "/me/goal"),
        ("POST", "/me/goal/proposal"),
        ("POST", "/me/goal/reset"),
        ("GET", f"/workouts/{record['id']}/score"),
        ("POST", f"/workouts/{record['id']}/score/evaluate"),
        ("GET", f"/groups/{group['id']}/workouts/{record['id']}/score"),
        ("GET", f"/groups/{group['id']}/score-weights"),
        ("PUT", f"/groups/{group['id']}/score-weights"),
    ]:
        assert client.request(method, f"/api{path}").status_code == 404
    for table in [
        "gotore_goal_versions",
        "gotore_workout_goals",
        "gotore_workout_scores",
        "gotore_ai_usage",
        "gotore_score_observations",
    ]:
        assert connection.execute(f"SELECT count(*) AS n FROM public.{table}").fetchone()["n"] == 0


def test_pausing_preserves_historical_goal_and_score(client, connection):
    record = finish(client, save(client, start(client)))
    goal = connection.execute(
        """INSERT INTO public.gotore_goal_versions (user_id, version, body, is_standard, criteria)
        VALUES (%s, 1, '過去の目標', false, '[{}, {}]') RETURNING id""",
        (record["user_id"],),
    ).fetchone()
    connection.execute(
        """INSERT INTO public.gotore_workout_scores
        (workout_id, user_id, revision, goal_id, components, snapshot, status,
         formula_version, prompt_version, personal_total)
        VALUES (%s, %s, %s, %s, '{}', '{}', 'complete', 'score-v2', 'v1', 88)""",
        (record["id"], record["user_id"], record["revision"], goal["id"]),
    )
    before = connection.execute("SELECT * FROM public.gotore_workout_scores").fetchall()
    from pathlib import Path

    migration = (
        Path(__file__).parents[2] / "supabase/migrations/20260913010000_pause_score_observation.sql"
    )
    connection.execute(migration.read_text())
    assert client.get("/api/workouts").json()[0]["score"] is None
    response = client.patch(
        f"/api/workouts/{record['id']}",
        json={
            "expected_revision": record["revision"],
            "performed_on": record["performed_on"],
            "exercises": [{"name": "ベンチプレス", "sets": [{"weight": 40, "reps": 10}]}],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["score"] is None
    assert connection.execute("SELECT * FROM public.gotore_workout_scores").fetchall() == before
    assert (
        connection.execute("SELECT body FROM public.gotore_goal_versions").fetchone()["body"]
        == "過去の目標"
    )


def test_goal_and_score_tables_do_not_allow_direct_client_access(client, connection):
    import psycopg

    record = finish(client, save(client, start(client)))
    with connection.transaction(force_rollback=True):
        connection.execute("""DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                CREATE ROLE authenticated NOLOGIN;
            END IF;
        END $$""")
        connection.execute("GRANT USAGE ON SCHEMA public TO authenticated")
        connection.execute("""GRANT SELECT, INSERT ON public.gotore_goal_versions,
            public.gotore_workout_goals, public.gotore_workout_scores,
            public.gotore_score_observations, public.gotore_group_score_weights,
            public.gotore_ai_usage TO authenticated""")
        connection.execute("SET LOCAL ROLE authenticated")
        for table in [
            "gotore_goal_versions",
            "gotore_workout_goals",
            "gotore_workout_scores",
            "gotore_score_observations",
            "gotore_group_score_weights",
            "gotore_ai_usage",
        ]:
            assert connection.execute(f"SELECT * FROM public.{table}").fetchall() == []
        with pytest.raises(psycopg.errors.InsufficientPrivilege), connection.transaction():
            connection.execute(
                "INSERT INTO public.gotore_score_observations (user_id, first_day) VALUES (%s, %s)",
                (record["user_id"], date(2026, 9, 1)),
            )
