import gzip
import json
from uuid import uuid4

from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture
from tests.test_workout import payload

client = client_fixture
connection = connection_fixture


def test_snapshot_contains_only_own_confirmed_record_data(client):
    own = client.post("/api/workouts", json=payload()).json()
    other = client.post("/api/workouts", json=payload(), headers={"X-Test-User": "B"}).json()
    assert (
        client.put(
            f"/api/workouts/{own['id']}/memo",
            json={"content": "自分だけの記録メモ", "expected_revision": 0},
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/exercises/memo",
            json={"name": "ベンチプレス", "content": "自分だけの種目メモ", "expected_revision": 0},
        ).status_code
        == 200
    )

    response = client.get("/api/me/record-snapshot")
    assert response.status_code == 200, response.text
    snapshot = response.json()
    assert snapshot["version"] == 1
    assert own["id"] in [record["id"] for record in snapshot["workouts"]]
    assert other["id"] not in [record["id"] for record in snapshot["workouts"]]
    assert snapshot["workout_memos"][own["id"]]["content"] == "自分だけの記録メモ"
    assert snapshot["contexts"]["ベンチプレス"]["memo"]["content"] == "自分だけの種目メモ"
    assert (
        snapshot["contexts"]["ベンチプレス"]["previous"]
        == client.get("/api/exercises/context?name=ベンチプレス").json()["previous"]
    )
    assert response.headers["cache-control"] == "no-store"


def test_snapshot_replaces_deleted_records(client):
    own = client.post("/api/workouts", json=payload()).json()
    assert own["id"] in [
        record["id"] for record in client.get("/api/me/record-snapshot").json()["workouts"]
    ]
    assert client.delete(f"/api/workouts/{own['id']}?expected_revision=1").status_code == 204
    assert own["id"] not in [
        record["id"] for record in client.get("/api/me/record-snapshot").json()["workouts"]
    ]


def test_snapshot_includes_more_than_one_history_page(client):
    ids = {client.post("/api/workouts", json=payload()).json()["id"] for _ in range(51)}
    response = client.get("/api/me/record-snapshot")
    assert response.status_code == 200, response.text
    assert {record["id"] for record in response.json()["workouts"]} == ids


def manifest(snapshot):
    return {
        "version": 1,
        "workouts": [
            {
                "id": row["id"],
                "revision": row["revision"],
                "names": [exercise["name"] for exercise in row["exercises"]],
                "shared_group_ids": row["shared_group_ids"],
                "has_best": bool(row["best_sets"]),
            }
            for row in snapshot["workouts"]
        ],
        "options": [
            {"id": row["id"], "name": row["name"], "revision": row["revision"]}
            for row in snapshot["options"]
        ],
        "contexts": {
            name: value["memo"]["revision"] for name, value in snapshot["contexts"].items()
        },
        "workout_memos": {
            key: value["revision"] for key, value in snapshot["workout_memos"].items()
        },
        "session_exercise_memos": {
            key: {name: value["revision"] for name, value in memos.items()}
            for key, memos in snapshot["session_exercise_memos"].items()
        },
        "active_workout_id": next(
            (
                row["id"]
                for row in snapshot["workouts"]
                if row["started_at"] and not row["ended_at"]
            ),
            None,
        ),
    }


def test_changes_include_auto_finished_session_without_revision_change(client, connection):
    started = client.post("/api/sessions", json={"id": str(uuid4())}).json()
    before = client.get("/api/me/record-snapshot").json()
    connection.execute(
        """UPDATE public.gotore_workouts
        SET started_at = clock_timestamp() - interval '2 hours',
            last_activity_at = clock_timestamp() - interval '61 minutes'
        WHERE id = %s""",
        (started["id"],),
    )
    connection.execute("SELECT public.gotore_expire_inactive_sessions()")
    response = client.post("/api/me/record-snapshot/changes", json=manifest(before))
    assert response.status_code == 200, response.text
    changed = next(item for item in response.json()["workouts"] if item["id"] == started["id"])
    assert changed["revision"] == started["revision"]
    assert changed["auto_ended"] is True
    assert changed["ended_at"] is not None


def test_saved_snapshot_sync_returns_no_record_bodies_when_unchanged(client):
    client.post("/api/workouts", json=payload())
    saved = client.get("/api/me/record-snapshot").json()
    response = client.post("/api/me/record-snapshot/changes", json=manifest(saved))
    assert response.status_code == 200, response.text
    delta = response.json()
    assert delta["workouts"] == []
    assert delta["options"] == []
    assert delta["contexts"] == {}
    assert delta["deleted_workout_ids"] == []
    compressed = gzip.compress(json.dumps(manifest(saved), ensure_ascii=False).encode())
    compressed_response = client.post(
        "/api/me/record-snapshot/changes",
        content=compressed,
        headers={"Content-Encoding": "gzip", "Content-Type": "application/json"},
    )
    assert compressed_response.status_code == 200, compressed_response.text
    assert compressed_response.json()["workouts"] == []


def test_saved_snapshot_sync_returns_added_and_deleted_records(client):
    old = client.post("/api/workouts", json=payload()).json()
    saved = client.get("/api/me/record-snapshot").json()
    assert client.delete(f"/api/workouts/{old['id']}?expected_revision=1").status_code == 204
    added = client.post("/api/workouts", json=payload()).json()
    response = client.post("/api/me/record-snapshot/changes", json=manifest(saved))
    assert response.status_code == 200, response.text
    delta = response.json()
    assert delta["deleted_workout_ids"] == [old["id"]]
    assert [row["id"] for row in delta["workouts"]] == [added["id"]]
    assert "ベンチプレス" in delta["contexts"]


def test_saved_snapshot_sync_updates_previous_best_and_memos(client):
    old = client.post("/api/workouts", json=payload()).json()
    saved = client.get("/api/me/record-snapshot").json()
    client.put(
        f"/api/workouts/{old['id']}/memo",
        json={"content": "新しいメモ", "expected_revision": 0},
    )
    newer = client.post(
        "/api/workouts",
        json=payload(
            performed_on="2026-02-01",
            exercises=[{"name": "ベンチプレス", "sets": [{"weight": 100, "reps": 8}]}],
        ),
    ).json()
    delta = client.post("/api/me/record-snapshot/changes", json=manifest(saved)).json()
    assert {row["id"] for row in delta["workouts"]} == {old["id"], newer["id"]}
    assert delta["contexts"]["ベンチプレス"]["previous"]["id"] == newer["id"]
    assert delta["workout_memos"][old["id"]]["content"] == "新しいメモ"
    assert delta["deleted_workout_ids"] == []


def test_saved_snapshot_sync_never_returns_other_users_records(client):
    other = client.post("/api/workouts", json=payload(), headers={"X-Test-User": "B"}).json()
    other_snapshot = client.get("/api/me/record-snapshot", headers={"X-Test-User": "B"}).json()
    response = client.post("/api/me/record-snapshot/changes", json=manifest(other_snapshot))
    assert response.status_code == 200, response.text
    assert other["id"] not in [row["id"] for row in response.json()["workouts"]]


def test_saved_snapshot_sync_removes_deleted_option_and_updates_exercise_memo(client):
    option = client.post("/api/exercise-options", json={"name": "独自種目"}).json()
    saved = client.get("/api/me/record-snapshot").json()
    assert client.delete(f"/api/exercise-options/{option['id']}").status_code == 204
    assert client.put(
        "/api/exercises/memo",
        json={"name": "ベンチプレス", "content": "更新後", "expected_revision": 0},
    ).status_code == 200
    response = client.post("/api/me/record-snapshot/changes", json=manifest(saved))
    assert response.status_code == 200, response.text
    delta = response.json()
    assert option["id"] in delta["deleted_option_ids"]
    assert "独自種目" in delta["deleted_context_names"]
    assert delta["contexts"]["ベンチプレス"]["memo"]["content"] == "更新後"
