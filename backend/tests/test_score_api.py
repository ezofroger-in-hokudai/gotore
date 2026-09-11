from contextlib import contextmanager
from datetime import date
from uuid import uuid4

import pytest

from app.api.routes.scores import score_connections
from app.core.config import settings
from app.infrastructure.score_llm import ScoreLLM
from app.infrastructure.scores import ScoreRepository
from app.main import app
from tests.test_sessions import save as save_response
from tests.test_sessions import start
from tests.test_sharing import USERS, create_group
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture

client = client_fixture
connection = connection_fixture


@pytest.fixture(autouse=True)
def llm_database(client, connection):
    state = {"connections": 0}

    @contextmanager
    def connect():
        state["connections"] += 1
        try:
            yield connection
        finally:
            state["connections"] -= 1

    app.dependency_overrides[score_connections] = lambda: connect
    yield state
    app.dependency_overrides.pop(score_connections, None)


def save(client, record):
    response = save_response(client, record)
    assert response.status_code == 200, response.text
    return response.json()


def goal_input(version=1, text="背中を中心に鍛える"):
    return {
        "expected_version": version,
        "body": text,
        "is_standard": False,
        "criteria": [
            {"text": "背中を使う種目に取り組む", "observation_days": 1},
            {"text": "背中の種目をメニューに含める", "observation_days": 7},
        ],
    }


def finish(client, record):
    response = client.post(
        f"/api/sessions/{record['id']}/finish", json={"expected_revision": record["revision"]}
    )
    assert response.status_code == 200, response.text
    return response.json()


def score(client, record):
    response = client.get(f"/api/workouts/{record['id']}/score")
    assert response.status_code == 200, response.text
    return response.json()


def test_goal_changes_apply_to_next_start_and_preserve_scored_snapshot(client):
    original = client.get("/api/me/goal").json()
    assert original["version"] == 1
    first = save(client, start(client))
    changed = client.put("/api/me/goal", json=goal_input()).json()
    assert changed["version"] == 2
    result = finish(client, first)
    before = score(client, result)
    assert before["goal"]["version"] == 1
    assert before["goal"]["is_standard"] is True
    assert before["total"] is None
    assert before["components"]["c"] is None
    assert before["status"] == "pending"
    assert client.put("/api/me/goal", json=goal_input()).json()["version"] == 2
    assert client.put("/api/me/goal", json=goal_input(text="別の変更")).status_code == 409
    assert client.put("/api/me/goal", json=goal_input(2, "全身を鍛える")).status_code == 200
    assert score(client, result) == before
    second = finish(client, save(client, start(client)))
    assert score(client, second)["goal"]["version"] == 3


def test_baseline_excludes_same_day_active_other_user_and_different_exercises(client, connection):
    client.get("/api/me/goal")

    def history(day, weight, name="ベンチプレス", owner="A", active=False):
        client.get("/api/me", headers={"X-Test-User": owner})
        wid = uuid4()
        connection.execute(
            """INSERT INTO public.gotore_workouts
            (id, user_id, performed_on, exercises, started_at, last_seen_at)
            VALUES (%s, %s, %s, jsonb_build_array(jsonb_build_object('name', %s::text,
                'sets', jsonb_build_array(jsonb_build_object('weight', %s::int, 'reps', 8)))),
                CASE WHEN %s THEN clock_timestamp() ELSE NULL END,
                CASE WHEN %s THEN clock_timestamp() ELSE NULL END)""",
            (wid, USERS[owner], day, name, weight, active, active),
        )
        return str(wid)

    chosen = history("2026-09-11", 60)
    history("2026-09-12", 1000)
    history("2026-08-12", 1000)
    history("2026-09-11", 1000, name="スクワット")
    history("2026-09-11", 1000, owner="B")
    history("2026-09-11", 1000, owner="C", active=True)
    current = save(client, start(client))
    connection.execute(
        "UPDATE public.gotore_workouts SET performed_on = %s WHERE id = %s",
        (date(2026, 9, 12), current["id"]),
    )
    result = score(client, finish(client, current))
    assert result["baseline"]["id"] == chosen
    assert result["components"]["v"] == 100
    assert result["components"]["i"] == 100


def test_scores_share_only_public_fields_and_follow_membership_and_deletion(client):
    group = create_group(client)
    client.post(
        "/api/groups/join", json={"invite_code": group["invite_code"]}, headers={"X-Test-User": "B"}
    )
    client.get("/api/me/goal")
    client.put("/api/me/goal", json=goal_input(text="非公開の個人目標"))
    record = finish(client, save(client, start(client)))
    private_path = f"/api/workouts/{record['id']}/score"
    assert client.get(private_path, headers={"X-Test-User": "B"}).status_code == 404
    shared_path = f"/api/groups/{group['id']}/workouts/{record['id']}/score"
    response = client.get(shared_path, headers={"X-Test-User": "B"})
    assert response.status_code == 200, response.text
    assert "goal" not in response.json()
    assert "comment" not in response.json()
    assert "非公開" not in response.text
    assert "baseline" not in response.json()
    assert client.get(shared_path, headers={"X-Test-User": "C"}).status_code == 404
    assert (
        client.delete(
            f"/api/workouts/{record['id']}?expected_revision={record['revision']}"
        ).status_code
        == 204
    )
    assert client.get(private_path).status_code == 404
    assert client.get(shared_path, headers={"X-Test-User": "B"}).status_code == 404


def test_empty_end_and_legacy_workouts_do_not_get_scores(client):
    empty = finish(client, start(client))
    assert score(client, empty) is None
    response = client.post(
        "/api/workouts",
        json={
            "id": str(uuid4()),
            "performed_on": "2026-09-01",
            "exercises": [{"name": "ベンチ", "sets": [{"weight": 60, "reps": 8}]}],
        },
    )
    assert response.status_code == 201, response.text
    assert score(client, response.json()) is None


def test_llm_runs_once_with_frozen_input_and_no_connection_during_wait(
    client, connection, monkeypatch, llm_database
):
    calls = []
    monkeypatch.setattr(settings, "openai_api_key", "test-key")

    def evaluate(self, inputs, prompt):
        assert llm_database["connections"] == 0
        calls.append(inputs)
        assert "user_id" not in str(inputs)
        return {
            "judgments": [
                {"rating": 1, "reason": "種目を実施"},
                {"rating": 1, "reason": "自由な配分"},
            ],
            "comment": "今日も積み重ねられました。",
            "g": 100,
        }, "test-snapshot"

    monkeypatch.setattr(ScoreLLM, "evaluate", evaluate)
    record = finish(client, save(client, start(client)))
    endpoint = f"/api/workouts/{record['id']}/score/evaluate"
    assert calls == []
    for _ in range(2):
        response = client.post(endpoint)
        assert response.status_code == 200, response.text
        assert response.json()["components"]["g"] == 100
        assert response.json()["comment"] == "今日も積み重ねられました。"
    assert len(calls) == 1
    assert score(client, record)["model"] == "test-snapshot"
    assert client.post(endpoint, headers={"X-Test-User": "B"}).status_code == 404
    assert client.get("/api/workouts").json()[0]["score"]["components"]["g"] == 100


def test_llm_retry_reuses_input_and_claim_blocks_duplicates(client, connection, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    record = finish(client, save(client, start(client)))
    endpoint = f"/api/workouts/{record['id']}/score/evaluate"
    calls = []

    def fail(self, inputs, prompt):
        calls.append(inputs)
        raise ValueError("通信失敗")

    monkeypatch.setattr(ScoreLLM, "evaluate", fail)
    assert client.post(endpoint).status_code == 503
    assert score(client, record)["status"] == "pending"
    client.put("/api/me/goal", json=goal_input())
    assert client.post(endpoint).status_code == 503
    assert calls[0] == calls[1]
    repo = ScoreRepository(connection)
    from uuid import UUID

    claimed = repo.claim(USERS["A"], UUID(record["id"]), "test-model", 30)
    assert claimed is not None
    assert repo.claim(USERS["A"], UUID(record["id"]), "test-model", 30) is None
    assert client.post(endpoint).json()["status"] == "processing"
    assert len(calls) == 2


def test_group_weights_are_owner_only_next_week_and_do_not_rescore(client, connection, monkeypatch):
    from uuid import UUID

    import app.api.routes.scores as routes

    monkeypatch.setattr(routes, "today_in_japan", lambda: date(2026, 9, 12))
    group = create_group(client)
    client.post(
        "/api/groups/join", json={"invite_code": group["invite_code"]}, headers={"X-Test-User": "B"}
    )
    record = finish(client, save(client, start(client)))
    endpoint = f"/api/groups/{group['id']}/score-weights"
    values = {"c": 50, "i": 0, "v": 50, "g": 0, "expected_version": 0}
    assert client.put(endpoint, json=values, headers={"X-Test-User": "B"}).status_code == 404
    assert client.put(endpoint, json={**values, "g": 1}).status_code == 422
    response = client.put(endpoint, json=values)
    assert response.status_code == 200, response.text
    assert response.json()["scheduled"]["effective_on"] == "2026-09-14"
    assert response.json()["current"]["g"] == 10
    assert client.put(endpoint, json=values).status_code == 409
    repo = ScoreRepository(connection)
    assert repo.weights(UUID(group["id"]), date(2026, 9, 14))[0].g == 0
    assert score(client, record)["status"] == "pending"
    assert client.get(endpoint, headers={"X-Test-User": "C"}).status_code == 404


def test_llm_daily_limit_and_invalid_reset_preserve_goal(client, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    monkeypatch.setattr(settings, "goal_proposal_daily_limit", 1)
    monkeypatch.setattr(
        ScoreLLM,
        "propose",
        lambda self, body: {"criteria": goal_input()["criteria"], "questions": []},
    )
    assert client.post("/api/me/goal/proposal", json={"body": "背中を鍛えたい"}).status_code == 200
    assert client.post("/api/me/goal/proposal", json={"body": "背中を鍛えたい"}).status_code == 409
    before = client.get("/api/me/goal").json()
    for version in [-1, True, 1.5]:
        assert (
            client.post("/api/me/goal/reset", json={"expected_version": version}).status_code == 422
        )
    assert client.get("/api/me/goal").json() == before


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


def test_edit_rescores_only_changed_record_with_original_goal_and_baseline(
    client, connection, monkeypatch
):
    from uuid import UUID

    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    baseline = finish(client, save(client, start(client)))
    connection.execute(
        "UPDATE public.gotore_workouts SET performed_on = %s WHERE id = %s",
        (date(2026, 9, 10), baseline["id"]),
    )
    current = save(client, start(client))
    connection.execute(
        "UPDATE public.gotore_workouts SET performed_on = %s WHERE id = %s",
        (date(2026, 9, 12), current["id"]),
    )
    current = finish(client, current)
    original = score(client, current)
    assert original["baseline"]["id"] == baseline["id"]
    repo = ScoreRepository(connection)
    old_job = repo.claim(USERS["A"], UUID(current["id"]), "test-model", 30)
    client.put("/api/me/goal", json=goal_input())
    # 比較元を後から訂正しても、現在の記録の元の根拠は変わらない。
    connection.execute(
        "UPDATE public.gotore_workouts SET exercises = '[]', revision = revision + 1 WHERE id = %s",
        (baseline["id"],),
    )
    other_before = connection.execute(
        "SELECT * FROM public.gotore_workout_scores WHERE workout_id = %s", (baseline["id"],)
    ).fetchone()
    values = {
        "expected_revision": current["revision"],
        "performed_on": "2026-09-12",
        "exercises": [{"name": "ベンチプレス", "sets": [{"weight": 30, "reps": 8}]}],
    }
    response = client.patch(f"/api/workouts/{current['id']}", json=values)
    assert response.status_code == 200, response.text
    edited = response.json()
    assert edited["score"]["status"] == "pending"
    assert edited["score"]["revision"] == edited["revision"]
    assert edited["score"]["components"]["v"] < original["components"]["v"]
    detail = score(client, edited)
    assert detail["goal"] == original["goal"]
    assert detail["baseline"] == original["baseline"]
    repo.complete(old_job, {"g": 0, "comment": "古い判定", "judgments": []}, "test-model")
    assert score(client, edited)["comment"] is None
    assert (
        client.patch(f"/api/workouts/{current['id']}", json=values).json()["score"]
        == edited["score"]
    )
    assert (
        connection.execute(
            "SELECT * FROM public.gotore_workout_scores WHERE workout_id = %s", (baseline["id"],)
        ).fetchone()
        == other_before
    )
    changed_menu = client.patch(
        f"/api/workouts/{current['id']}",
        json={
            **values,
            "expected_revision": edited["revision"],
            "exercises": [{"name": "スクワット", "sets": [{"weight": 30, "reps": 8}]}],
        },
    ).json()
    assert changed_menu["score"]["components"]["v"] is None
    assert changed_menu["score"]["components"]["i"] is None
