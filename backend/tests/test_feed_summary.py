from tests.test_sessions import save, start
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture
from tests.test_sharing import create_group

client = client_fixture
connection = connection_fixture


def test_feed_summary_tracks_saved_record_and_does_not_expose_private_fields(client):
    group = create_group(client)
    path = f"/api/groups/{group['id']}/activity"
    session = start(client)
    assert client.get(path).json()["feed"] == []
    response = client.patch(
        f"/api/sessions/{session['id']}",
        json={
            "expected_revision": session["revision"],
            "exercises": [
                {"name": "ベンチプレス", "sets": [{"weight": 80, "reps": 10}] * 3},
                {"name": "腕立て伏せ", "sets": [{"weight": 0, "reps": 15}] * 2},
            ],
        },
    )
    assert response.status_code == 200
    saved = response.json()
    feed = client.get(path).json()["feed"][0]
    assert feed["summary"] == {
        "exercise_count": 2,
        "set_count": 5,
        "total_volume": 2400.0,
    }
    assert not {"memo", "goal", "comment", "exercises"}.intersection(feed)
    ended = client.post(
        f"/api/sessions/{session['id']}/finish",
        json={"expected_revision": saved["revision"]},
    )
    assert ended.status_code == 200
    assert client.get(path).json()["feed"][0]["summary"] == feed["summary"]
    response = client.patch(
        f"/api/workouts/{session['id']}",
        json={
            "expected_revision": ended.json()["revision"],
            "performed_on": saved["performed_on"],
            "exercises": [{"name": "腕立て伏せ", "sets": [{"weight": 0, "reps": 10}]}],
        },
    )
    assert response.status_code == 200, response.text
    assert client.get(path).json()["feed"][0]["summary"] == {
        "exercise_count": 1,
        "set_count": 1,
        "total_volume": 0.0,
    }
    deleted = client.delete(
        f"/api/workouts/{session['id']}",
        params={"expected_revision": response.json()["revision"]},
    )
    assert deleted.status_code == 204, deleted.text
    assert client.get(path).json()["feed"] == []


def test_private_record_has_no_feed_summary(client):
    session = start(client)
    assert save(client, session).status_code == 200
    group = create_group(client)
    assert client.get(f"/api/groups/{group['id']}/activity").json()["feed"] == []


def test_summary_counts_same_name_once_and_empty_sets_never_count():
    from app.domain.workout import workout_summary

    assert workout_summary([]) == {"exercise_count": 0, "set_count": 0}
    assert workout_summary(
        [
            {"name": "腕立て伏せ", "sets": [{"weight": 0, "reps": 10}]},
            {"name": "腕立て伏せ", "sets": [{"weight": 0, "reps": 15}]},
            {"name": "未記録", "sets": []},
        ]
    ) == {"exercise_count": 1, "set_count": 2}
