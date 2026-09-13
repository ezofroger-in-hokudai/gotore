import pytest

from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture

client = client_fixture
connection = connection_fixture


def test_body_parts_are_private_persisted_and_revision_protected(client):
    path = "/api/exercise-options"
    initial = client.get(path).json()
    bench = next(item for item in initial if item["name"] == "ベンチプレス")
    assert bench["primary_body_part"] == "chest"
    assert set(bench["secondary_body_parts"]) == {"shoulders", "arms"}
    custom = client.post(
        path,
        json={"name": "自分の種目", "primary_body_part": "back", "secondary_body_parts": ["arms"]},
    ).json()
    assert custom["primary_body_part"] == "back"
    assert client.post(path, json={"name": "自分の種目"}).json() == custom
    edit = {"expected_revision": 1, "primary_body_part": "shoulders", "secondary_body_parts": []}
    endpoint = f"{path}/{custom['id']}"
    assert client.patch(endpoint, json=edit, headers={"X-Test-User": "B"}).status_code == 404
    changed = client.patch(endpoint, json=edit)
    assert changed.status_code == 200, changed.text
    assert changed.json()["revision"] == 2
    assert client.patch(endpoint, json=edit).json() == changed.json()
    assert client.patch(endpoint, json={**edit, "primary_body_part": "legs"}).status_code == 409
    assert next(x for x in client.get(path).json() if x["id"] == custom["id"]) == changed.json()
    assert (
        next(
            x
            for x in client.get(path, headers={"X-Test-User": "B"}).json()
            if x["name"] == "ベンチプレス"
        )["primary_body_part"]
        == "chest"
    )
    assert client.delete(endpoint).status_code == 204
    assert client.patch(endpoint, json=edit).status_code == 404


@pytest.mark.parametrize(
    "parts",
    [
        {"primary_body_part": "invalid"},
        {"primary_body_part": "chest", "secondary_body_parts": ["unknown"]},
        {"primary_body_part": "chest", "secondary_body_parts": ["chest"]},
        {"primary_body_part": "chest", "secondary_body_parts": ["arms", "arms"]},
        {"secondary_body_parts": ["arms"]},
        {"primary_body_part": 1},
        {"secondary_body_parts": None},
    ],
)
def test_invalid_classification_is_rejected(client, parts):
    assert client.post("/api/exercise-options", json={"name": "test", **parts}).status_code == 422


def test_metadata_changes_preserve_record_and_legacy_create(client):
    from tests.test_workout import payload

    option = client.post("/api/exercise-options", json={"name": "過去の種目"}).json()
    assert option["primary_body_part"] is None
    assert option["secondary_body_parts"] == []
    data = payload(exercises=[{"name": "過去の種目", "sets": [{"weight": 20, "reps": 10}]}])
    record = client.post("/api/workouts", json=data).json()
    endpoint = f"/api/exercise-options/{option['id']}"
    edit = {"expected_revision": 1, "primary_body_part": "legs", "secondary_body_parts": ["glutes"]}
    assert client.patch(endpoint, json=edit).status_code == 200
    assert client.patch(endpoint, json={**edit, "expected_revision": True}).status_code == 422
    assert client.patch(endpoint, json={**edit, "user_id": record["user_id"]}).status_code == 422
    assert client.get("/api/workouts").json()[0] == record


def test_migration_preserves_custom_names_and_empty_catalog(client, connection):
    from pathlib import Path

    from tests.test_sharing import USERS

    path = "/api/exercise-options"
    client.get(path)
    client.post(path, json={"name": "独自メニュー"})
    for option in client.get(path, headers={"X-Test-User": "B"}).json():
        client.delete(f"{path}/{option['id']}", headers={"X-Test-User": "B"})
    before = connection.execute(
        "SELECT id, user_id, name, created_at FROM public.gotore_exercise_options ORDER BY id"
    ).fetchall()
    # テスト専用トランザクション内で旧schemaを再現して移行を検証する。
    connection.execute(
        """ALTER TABLE public.gotore_exercise_options
        DROP COLUMN primary_body_part, DROP COLUMN secondary_body_parts, DROP COLUMN revision"""
    )
    migration = (
        Path(__file__).parents[2] / "supabase/migrations/20260913020000_exercise_body_parts.sql"
    )
    connection.execute(migration.read_text())
    assert (
        connection.execute(
            "SELECT id, user_id, name, created_at FROM public.gotore_exercise_options ORDER BY id"
        ).fetchall()
        == before
    )
    options = client.get(path).json()
    assert next(x for x in options if x["name"] == "ベンチプレス")["primary_body_part"] == "chest"
    custom = next(x for x in options if x["name"] == "独自メニュー")
    assert custom["primary_body_part"] is None
    assert custom["secondary_body_parts"] == []
    assert custom["revision"] == 1
    assert client.get(path, headers={"X-Test-User": "B"}).json() == []
    assert connection.execute(
        "SELECT user_id FROM public.gotore_exercise_catalogs WHERE user_id = %s", (USERS["B"],)
    ).fetchone()


@pytest.mark.parametrize(
    "primary,secondary",
    [
        ("invalid", []),
        ("chest", ["chest"]),
        ("chest", ["arms", "arms"]),
        (None, ["arms"]),
        ("chest", [None]),
        ("chest", ["unknown"]),
    ],
)
def test_database_rejects_invalid_body_parts(client, connection, primary, secondary):
    import psycopg

    option = client.get("/api/exercise-options").json()[0]
    with pytest.raises(psycopg.errors.CheckViolation), connection.transaction():
        connection.execute(
            """UPDATE public.gotore_exercise_options
            SET primary_body_part = %s, secondary_body_parts = %s WHERE id = %s""",
            (primary, secondary, option["id"]),
        )
