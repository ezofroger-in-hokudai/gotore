import os
from pathlib import Path
from uuid import UUID

import httpx
import psycopg
import pytest
from fastapi import Header
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from app.api.dependencies import current_user, database
from app.core.config import settings
from app.domain.identity import AuthenticatedUser
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
        return AuthenticatedUser(id=USERS[x_test_user], display_name=x_test_user)

    app.dependency_overrides[current_user] = identity
    app.dependency_overrides[database] = lambda: connection
    with connection.transaction(force_rollback=True), TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def create_group(client):
    response = client.post("/api/groups", json={"name": "朝トレ部"})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.parametrize(
    "metadata", [{}, None, {"display_name": None}, {"display_name": "  "}, {"display_name": 123}]
)
@pytest.mark.parametrize("existing_name", ["DBで設定した名前", None])
def test_missing_auth_name_preserves_profile_on_every_access(
    client, connection, monkeypatch, metadata, existing_name
):
    group = create_group(client)
    client.post("/api/workouts", json=payload(group_id=group["id"]))
    if existing_name:
        connection.execute(
            "UPDATE public.gotore_profiles SET display_name = %s WHERE id = %s",
            (existing_name, USERS["A"]),
        )
    # 初回プロフィール作成は、まだアクセスしていない別ユーザーで確認する。
    user_id = USERS["A"] if existing_name else USERS["B"]
    expected = existing_name or "トレーニー"
    app.dependency_overrides.pop(current_user)
    monkeypatch.setattr(settings, "supabase_url", "http://auth.test")
    monkeypatch.setattr(settings, "supabase_anon_key", "test-key")
    monkeypatch.setattr(
        httpx,
        "get",
        lambda *args, **kwargs: httpx.Response(
            200, json={"id": str(user_id), "user_metadata": metadata}
        ),
    )
    headers = {"Authorization": "Bearer verified"}
    for _ in range(2):
        assert client.get("/api/groups", headers=headers).status_code == 200
        for response in [
            client.get("/api/me", headers=headers),
            client.post(
                "/api/me/profile",
                headers=headers,
                json={"id": str(USERS["C"]), "display_name": "偽装"},
            ),
        ]:
            assert response.status_code == 200, response.text
            assert response.json() == {"id": str(user_id), "display_name": expected}
            assert response.headers["cache-control"] == "no-store"
    stored = connection.execute(
        "SELECT display_name FROM public.gotore_profiles WHERE id = %s", (user_id,)
    ).fetchone()
    assert stored["display_name"] == expected
    if existing_name:
        assert (
            client.get(f"/api/groups/{group['id']}", headers=headers).json()["members"][0][
                "display_name"
            ]
            == expected
        )
        assert (
            client.get(f"/api/groups/{group['id']}/workouts", headers=headers).json()[0][
                "display_name"
            ]
            == expected
        )


@pytest.mark.parametrize("name", ["新しいAuth名", "トレーニー"])
def test_explicit_auth_name_overrides_existing_profile(client, connection, monkeypatch, name):
    create_group(client)
    app.dependency_overrides.pop(current_user)
    monkeypatch.setattr(settings, "supabase_url", "http://auth.test")
    monkeypatch.setattr(settings, "supabase_anon_key", "test-key")
    monkeypatch.setattr(
        httpx,
        "get",
        lambda *args, **kwargs: httpx.Response(
            200, json={"id": str(USERS["A"]), "user_metadata": {"display_name": f" {name} "}}
        ),
    )
    response = client.get("/api/me", headers={"Authorization": "Bearer verified"})
    assert response.json() == {"id": str(USERS["A"]), "display_name": name}
    assert (
        connection.execute(
            "SELECT display_name FROM public.gotore_profiles WHERE id = %s", (USERS["A"],)
        ).fetchone()["display_name"]
        == name
    )


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


def test_profile_sync_uses_verified_identity_and_updates_existing_shared_records(client):
    group = create_group(client)
    client.post(
        "/api/groups/join", json={"invite_code": group["invite_code"]}, headers={"X-Test-User": "B"}
    )
    client.post("/api/workouts", json=payload(group_id=group["id"]))
    app.dependency_overrides[current_user] = lambda: AuthenticatedUser(
        id=USERS["A"], display_name="新しい本人名"
    )
    response = client.post(
        "/api/me/profile", json={"id": str(USERS["B"]), "display_name": "なりすまし"}
    )
    assert response.status_code == 200
    assert response.json() == {"id": str(USERS["A"]), "display_name": "新しい本人名"}
    members = client.get(f"/api/groups/{group['id']}").json()["members"]
    assert {m["id"]: m["display_name"] for m in members} == {
        str(USERS["A"]): "新しい本人名",
        str(USERS["B"]): "B",
    }
    assert (
        client.get(f"/api/groups/{group['id']}/workouts").json()[0]["display_name"]
        == "新しい本人名"
    )


def test_only_owner_can_rename_group_without_changing_members_or_records(client):
    group = create_group(client)
    path = f"/api/groups/{group['id']}"
    client.post(
        "/api/groups/join", json={"invite_code": group["invite_code"]}, headers={"X-Test-User": "B"}
    )
    record = payload(group_id=group["id"])
    client.post("/api/workouts", json=record)
    for user in ["B", "C"]:
        assert (
            client.patch(path, json={"name": "不正変更"}, headers={"X-Test-User": user}).status_code
            == 404
        )
    for _ in range(2):
        result = client.patch(path, json={"name": "  夜トレ部  "})
        assert result.status_code == 200
        assert result.json() == {**group, "name": "夜トレ部"}
    detail = client.get(path, headers={"X-Test-User": "B"}).json()
    assert detail["name"] == "夜トレ部"
    assert {member["id"] for member in detail["members"]} == {str(USERS["A"]), str(USERS["B"])}
    assert client.get("/api/groups", headers={"X-Test-User": "B"}).json()[0]["name"] == "夜トレ部"
    assert client.get(f"{path}/workouts").json()[0]["id"] == record["id"]
    assert client.patch(f"/api/groups/{USERS['C']}", json={"name": "不明"}).status_code == 404


@pytest.mark.parametrize(
    "data", [{"name": " "}, {"name": "長" * 41}, {"name": "変更", "owner_id": str(USERS["B"])}]
)
def test_rename_rejects_invalid_name_and_owner_changes(client, data):
    group = create_group(client)
    assert client.patch(f"/api/groups/{group['id']}", json=data).status_code == 422
    assert client.get(f"/api/groups/{group['id']}").json()["name"] == group["name"]


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


def test_activity_uses_all_own_sets_with_month_boundaries_and_daily_pages(client):
    group = create_group(client)
    client.post(
        "/api/groups/join", json={"invite_code": group["invite_code"]}, headers={"X-Test-User": "B"}
    )

    def save(day, counts, user="A", shared=False):
        record = payload(group_id=group["id"] if shared else None)
        record["performed_on"] = day
        record["exercises"] = [
            {"name": f"種目{index}", "sets": [{"weight": 0, "reps": 10}] * count}
            for index, count in enumerate(counts)
        ]
        response = client.post("/api/workouts", json=record, headers={"X-Test-User": user})
        assert response.status_code == 201
        return record["id"]

    save("2024-02-01", [1, 2])
    save("2024-02-01", [2], shared=True)
    save("2024-02-01", [6], user="B", shared=True)
    save("2024-02-29", [9], user="B")
    save("2024-01-31", [10])
    save("2024-03-01", [10])
    ids = {save("2024-02-29", [1]) for _ in range(51)}
    response = client.get("/api/workouts/activity?month=2024-02")
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "month": "2024-02",
        "metric": "sets",
        "total_sets": 56,
        "workout_count": 53,
        "active_days": 2,
        "days": [
            {"date": "2024-02-01", "set_count": 5, "workout_count": 2},
            {"date": "2024-02-29", "set_count": 51, "workout_count": 51},
        ],
    }
    first = client.get("/api/workouts?performed_on=2024-02-29").json()
    second = client.get("/api/workouts?performed_on=2024-02-29&offset=50").json()
    assert len(first) == 50 and len(second) == 1
    assert {r["id"] for r in first + second} == ids
    assert {r["performed_on"] for r in first + second} == {"2024-02-29"}
    assert client.get("/api/workouts?performed_on=2024-02-02").json() == []
    assert len(client.get("/api/workouts?limit=50&offset=50").json()) == 5
    other = client.get("/api/workouts/activity?month=2024-02", headers={"X-Test-User": "B"}).json()
    assert other["total_sets"] == 15
    assert other["workout_count"] == 2
    assert (
        len(
            client.get("/api/workouts?performed_on=2024-02-29", headers={"X-Test-User": "B"}).json()
        )
        == 1
    )


def test_activity_empty_month_and_refresh_after_record_changes(client, connection):
    path = "/api/workouts/activity?month=2024-12"
    empty = {
        "month": "2024-12",
        "metric": "sets",
        "total_sets": 0,
        "workout_count": 0,
        "active_days": 0,
        "days": [],
    }
    assert client.get(path).json() == empty
    record = payload()
    record["performed_on"] = "2024-12-31"
    assert client.post("/api/workouts", json=record).status_code == 201
    assert client.get(path).json()["total_sets"] == 1
    assert client.get("/api/workouts/activity?month=2025-01").json()["total_sets"] == 0
    connection.execute(
        "UPDATE public.gotore_workouts SET performed_on = '2025-01-01' WHERE id = %s",
        (record["id"],),
    )
    assert client.get(path).json() == empty
    assert client.get("/api/workouts/activity?month=2025-01").json()["total_sets"] == 1
    connection.execute("DELETE FROM public.gotore_workouts WHERE id = %s", (record["id"],))
    assert client.get("/api/workouts/activity?month=2025-01").json()["total_sets"] == 0


@pytest.mark.parametrize(
    "month", ["2024-00", "2024-13", "2024-2", "1999-12", "9999-01", "not-month", "2024-02-01"]
)
def test_activity_rejects_invalid_or_out_of_range_months(client, month):
    assert client.get("/api/workouts/activity", params={"month": month}).status_code == 422


@pytest.mark.parametrize("day", ["2023-02-29", "1999-12-31", "9999-01-01", "bad"])
def test_daily_records_reject_invalid_dates(client, day):
    assert client.get("/api/workouts", params={"performed_on": day}).status_code == 422
