from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture

client = client_fixture
connection = connection_fixture


def option(client, name, part, secondary=None, headers=None):
    return client.post(
        "/api/exercise-options",
        json={"name": name, "primary_body_part": part, "secondary_body_parts": secondary or []},
        headers=headers or {},
    ).json()


def save(client, *names, weight=20, headers=None):
    from tests.test_workout import payload

    result = client.post(
        "/api/workouts",
        json=payload(
            performed_on="2024-02-29",
            exercises=[{"name": name, "sets": [{"weight": weight, "reps": 10}]} for name in names],
        ),
        headers=headers or {},
    )
    assert result.status_code == 201, result.text
    return result.json()


def activity(client, headers=None):
    result = client.get("/api/workouts/activity?month=2024-02", headers=headers or {})
    assert result.status_code == 200, result.text
    return result.json()


def by_part(day):
    return {row["body_part"]: row for row in day["body_parts"]}


def test_current_primary_is_private_and_not_double_counted(client):
    option(client, "胸A", "chest", ["arms"])
    option(client, "胸B", "chest", ["arms"])
    option(client, "腕A", "arms")
    save(client, "胸A", "胸B", "腕A")
    save(client, "胸A")
    option(client, "胸A", "legs", headers={"X-Test-User": "B"})
    save(client, "胸A", weight=30, headers={"X-Test-User": "B"})
    data = activity(client)
    assert data["total_volume"] == 800
    assert data["total_sets"] == 4
    assert data["workout_count"] == 2
    parts = by_part(data["days"][0])
    assert parts["chest"] == {
        "body_part": "chest",
        "volume": 600,
        "set_count": 3,
        "workout_count": 2,
    }
    assert parts["arms"] == {"body_part": "arms", "volume": 200, "set_count": 1, "workout_count": 1}
    assert set(parts) == {"chest", "arms"}
    assert set(by_part(activity(client, {"X-Test-User": "B"})["days"][0])) == {"legs"}


def test_reclassification_and_deleted_options_apply_to_old_records_without_mutation(client):
    item = option(client, "再分類する種目", "chest", ["arms"])
    record = save(client, "再分類する種目")
    path = f"/api/exercise-options/{item['id']}"
    changed = client.patch(
        path, json={"expected_revision": 1, "primary_body_part": "back", "secondary_body_parts": []}
    )
    assert changed.status_code == 200
    assert set(by_part(activity(client)["days"][0])) == {"back"}
    assert client.delete(path).status_code == 204
    assert set(by_part(activity(client)["days"][0])) == {None}
    current = client.get("/api/workouts?performed_on=2024-02-29").json()[0]
    assert current["exercises"] == record["exercises"]
    assert current["revision"] == record["revision"]


def test_zero_unclassified_edit_delete_and_one_query(client, connection):
    from datetime import date

    from app.infrastructure.training_repository import TrainingRepository
    from tests.test_session_performance import CountingConnection
    from tests.test_sharing import USERS

    option(client, "自重", "abs")
    record = save(client, "自重", weight=0)
    unknown = save(client, "昔の名前", weight=0)
    parts = by_part(activity(client)["days"][0])
    assert set(parts) == {"abs", None}
    assert all(row["volume"] == 0 and row["set_count"] == 1 for row in parts.values())
    counted = CountingConnection(connection)
    values = TrainingRepository(counted).activity(USERS["A"], date(2024, 2, 1), date(2024, 3, 1))
    assert counted.calls == 1
    assert values[0]["workout_count"] == 2
    edited = client.patch(
        f"/api/workouts/{record['id']}",
        json={
            "performed_on": "2024-02-29",
            "exercises": [{"name": "自重", "sets": [{"weight": 5, "reps": 10}]}],
            "expected_revision": record["revision"],
        },
    )
    assert edited.status_code == 200, edited.text
    assert by_part(activity(client)["days"][0])["abs"]["volume"] == 50
    for value in [edited.json(), unknown]:
        assert (
            client.delete(
                f"/api/workouts/{value['id']}?expected_revision={value['revision']}"
            ).status_code
            == 204
        )
    assert activity(client)["days"] == []
