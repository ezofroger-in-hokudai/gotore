import os
from pathlib import Path
from uuid import UUID

import psycopg
import pytest
from fastapi import Header
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from app.api.dependencies import current_user, database
from app.domain.identity import User
from app.main import app
from tests.test_workout import payload

USERS = {
    name: UUID(f"00000000-0000-0000-0000-00000000000{index}") for index, name in enumerate("ABC", 1)
}


@pytest.fixture(scope="module")
def connection():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URLに専用のテストDBを設定してください")
    with psycopg.connect(url, autocommit=True, row_factory=dict_row) as conn:
        assert conn.info.dbname.endswith("_test"), "専用の_test DBのみを使用します"
        conn.execute("CREATE SCHEMA IF NOT EXISTS auth")
        conn.execute("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)")
        # 専用DBのトランザクション内だけにschemaを展開する。
        with conn.transaction(force_rollback=True):
            for path in sorted((Path(__file__).parents[2] / "supabase/migrations").glob("*.sql")):
                conn.execute(path.read_text())
            for user_id in USERS.values():
                conn.execute("INSERT INTO auth.users (id) VALUES (%s)", (user_id,))
            yield conn


@pytest.fixture
def client(connection):
    def identity(x_test_user: str = Header(default="A")):
        return User(id=USERS[x_test_user], display_name=x_test_user)

    app.dependency_overrides[current_user] = identity
    app.dependency_overrides[database] = lambda: connection
    with connection.transaction(force_rollback=True), TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def create_group(client):
    response = client.post("/api/groups", json={"name": "朝トレ部"})
    assert response.status_code == 201, response.text
    return response.json()


def test_group_creator_joins_and_other_user_can_join_once(client):
    group = create_group(client)
    for _ in range(2):
        joined = client.post(
            "/api/groups/join",
            json={"invite_code": group["invite_code"]},
            headers={"X-Test-User": "B"},
        )
        assert joined.status_code == 200
    detail = client.get(f"/api/groups/{group['id']}").json()
    assert {member["display_name"] for member in detail["members"]} == {"A", "B"}
    assert len(client.get("/api/groups", headers={"X-Test-User": "B"}).json()) == 1


def test_record_is_shared_only_to_members_and_preserved(client):
    group = create_group(client)
    client.post(
        "/api/groups/join", json={"invite_code": group["invite_code"]}, headers={"X-Test-User": "B"}
    )
    record = payload(group_id=group["id"])
    assert client.post("/api/workouts", json=record).status_code == 201
    feed = client.get(f"/api/groups/{group['id']}/workouts", headers={"X-Test-User": "B"})
    assert feed.status_code == 200
    assert feed.json()[0]["id"] == record["id"]
    assert "email" not in feed.text
    assert client.get("/api/workouts", headers={"X-Test-User": "B"}).json() == []
    assert client.get("/api/workouts").json()[0]["id"] == record["id"]
    assert (
        client.get(f"/api/groups/{group['id']}/workouts", headers={"X-Test-User": "C"}).status_code
        == 404
    )
    assert client.get(f"/api/groups/{group['id']}", headers={"X-Test-User": "C"}).status_code == 404
    assert (
        client.post(
            "/api/workouts", json=payload(group_id=group["id"]), headers={"X-Test-User": "C"}
        ).status_code
        == 404
    )


def test_retry_does_not_duplicate_or_replace_a_record(client):
    record = payload()
    for _ in range(2):
        assert client.post("/api/workouts", json=record).status_code == 201
    assert len(client.get("/api/workouts").json()) == 1
    record["exercises"][0]["sets"][0]["reps"] = 10
    assert client.post("/api/workouts", json=record).status_code == 409
    assert client.get("/api/workouts").json()[0]["exercises"][0]["sets"][0]["reps"] == 8
    assert (
        client.post("/api/workouts", json=record, headers={"X-Test-User": "B"}).status_code == 409
    )


def test_private_record_does_not_become_shared_after_joining(client):
    assert client.post("/api/workouts", json=payload()).status_code == 201
    group = create_group(client)
    assert client.get(f"/api/groups/{group['id']}/workouts").json() == []
    assert client.post("/api/workouts", json=payload()).status_code == 201
    assert len(client.get("/api/workouts").json()) == 2
    assert len(client.get("/api/workouts?limit=1&offset=1").json()) == 1


def test_unknown_invite_does_not_join_any_group(client):
    assert client.post("/api/groups/join", json={"invite_code": "A" * 12}).status_code == 404
    assert client.get("/api/groups").json() == []


def test_public_database_role_cannot_read_or_write_training_data(client, connection):
    group = create_group(client)
    assert client.post("/api/workouts", json=payload(group_id=group["id"])).status_code == 201
    with connection.transaction(force_rollback=True):
        connection.execute("""DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                CREATE ROLE authenticated NOLOGIN;
            END IF;
        END $$""")
        connection.execute("GRANT USAGE ON SCHEMA public TO authenticated")
        connection.execute("""GRANT SELECT, INSERT ON public.gotore_profiles,
            public.gotore_groups, public.gotore_group_members, public.gotore_workouts
            TO authenticated""")
        connection.execute("SET LOCAL ROLE authenticated")
        for table in [
            "gotore_profiles",
            "gotore_groups",
            "gotore_group_members",
            "gotore_workouts",
        ]:
            assert connection.execute(f"SELECT * FROM public.{table}").fetchall() == []
        with pytest.raises(psycopg.errors.InsufficientPrivilege), connection.transaction():
            connection.execute(
                "INSERT INTO public.gotore_profiles (id, display_name) VALUES (%s, 'fake')",
                (USERS["C"],),
            )
