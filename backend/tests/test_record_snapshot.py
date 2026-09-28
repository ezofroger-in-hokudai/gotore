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
