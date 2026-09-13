from app.domain.personal_records import record_best_sets
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture


def exercise(*values, name="ベンチプレス"):
    return {"name": name, "sets": [{"weight": w, "reps": r} for w, r in values]}


def test_record_bests_distinguish_weight_and_rm_and_keep_only_current_winners():
    baseline = {"ベンチプレス": {"best_weight": 80, "best_rm": 80}}
    assert record_best_sets([exercise((82.5, 1), (75, 10), (75, 10))], baseline) == [
        {"exercise_index": 0, "set_index": 0, "weight": True, "rm": False},
        {"exercise_index": 0, "set_index": 1, "weight": False, "rm": True},
    ]
    assert record_best_sets([exercise((80, 8), (85, 8))], {}) == [
        {"exercise_index": 0, "set_index": 1, "weight": True, "rm": True},
    ]


def test_record_bests_preserve_first_equal_zero_and_rm_boundaries():
    assert record_best_sets([exercise((80, 8), (80, 8))], {}) == []
    assert record_best_sets([exercise((0, 8), (0, 8))], {}) == []
    assert record_best_sets(
        [exercise((81, 11))], {"ベンチプレス": {"best_weight": 80, "best_rm": 100}}
    ) == [
        {"exercise_index": 0, "set_index": 0, "weight": True, "rm": False},
    ]
    assert (
        record_best_sets(
            [exercise((80, 8))], {"ベンチプレス": {"best_weight": 80, "best_rm": 101.3}}
        )
        == []
    )


def test_record_bests_handle_repeated_exercise_rows_and_independent_names():
    records = [exercise((80, 8)), exercise((85, 8)), exercise((100, 1), name="スクワット")]
    assert record_best_sets(records, {}) == [
        {"exercise_index": 1, "set_index": 0, "weight": True, "rm": True},
    ]


client = client_fixture
connection = connection_fixture


def test_history_and_shared_detail_return_only_visible_record_positions(client):
    from tests.test_sharing import create_group
    from tests.test_workout import payload

    group = create_group(client)
    client.post(
        "/api/groups/join", json={"invite_code": group["invite_code"]}, headers={"X-Test-User": "B"}
    )
    baseline = client.post("/api/workouts", json=payload(exercises=[exercise((80, 1))])).json()
    record = client.post(
        "/api/workouts",
        json=payload(group_id=group["id"], exercises=[exercise((82.5, 1), (75, 10))]),
    ).json()
    expected = [
        {"exercise_index": 0, "set_index": 0, "weight": True, "rm": False},
        {"exercise_index": 0, "set_index": 1, "weight": False, "rm": True},
    ]
    own = next(row for row in client.get("/api/workouts").json() if row["id"] == record["id"])
    assert own["best_sets"] == expected
    path = f"/api/groups/{group['id']}/workouts/{record['id']}"
    shared = client.get(path, headers={"X-Test-User": "B"}).json()
    assert shared["best_sets"] == expected
    assert baseline["id"] not in str(shared)
    assert "baseline" not in shared
    assert client.get(path, headers={"X-Test-User": "C"}).status_code == 404
    group_records = client.get(
        f"/api/groups/{group['id']}/workouts", headers={"X-Test-User": "B"}
    ).json()
    assert [row["id"] for row in group_records] == [record["id"]]
    assert group_records[0]["best_sets"] == expected
    assert client.get("/api/workouts", headers={"X-Test-User": "B"}).json() == []

    # 上位の私的記録が増えたら共有側の強調も消すが、その数値は共有しない。
    higher = client.post("/api/workouts", json=payload(exercises=[exercise((100, 10))])).json()
    assert client.get(path, headers={"X-Test-User": "B"}).json()["best_sets"] == []
    client.delete(f"/api/workouts/{higher['id']}?expected_revision={higher['revision']}")
    assert client.get(path, headers={"X-Test-User": "B"}).json()["best_sets"] == expected


def test_context_returns_confirmed_revision_and_separate_best_metrics(client):
    from tests.test_sessions import start
    from tests.test_workout import payload

    client.post("/api/workouts", json=payload(exercises=[exercise((80, 1))]))
    session = start(client)
    saved = client.patch(
        f"/api/sessions/{session['id']}",
        json={
            "expected_revision": session["revision"],
            "exercises": [exercise((82.5, 1), (75, 10))],
        },
    ).json()
    context = client.get(
        f"/api/exercises/context?name=ベンチプレス&session_id={session['id']}"
    ).json()
    assert context["current_bests"] == {
        "revision": saved["revision"],
        "sets": [
            {"exercise_index": 0, "set_index": 0, "weight": True, "rm": False},
            {"exercise_index": 0, "set_index": 1, "weight": False, "rm": True},
        ],
    }
    assert (
        client.get(
            f"/api/exercises/context?name=ベンチプレス&session_id={session['id']}",
            headers={"X-Test-User": "B"},
        ).status_code
        == 404
    )


def test_batch_highlights_use_one_statistics_query_for_multiple_records(client, connection):
    from app.infrastructure.training_repository import TrainingRepository
    from tests.test_session_performance import CountingConnection
    from tests.test_sharing import USERS
    from tests.test_workout import payload

    for weight in (80, 82.5, 85, 90):
        client.post("/api/workouts", json=payload(exercises=[exercise((weight, 8))]))
    counted = CountingConnection(connection)
    repo = TrainingRepository(counted)
    records = repo.workouts(USERS["A"], None, 50, 0)
    counted.calls = 0
    results = repo.with_bests(records)
    assert counted.calls == 1
    assert sum(bool(row["best_sets"]) for row in results) == 1
    winner = next(row for row in results if row["best_sets"])
    assert winner["exercises"][0]["sets"][0]["weight"] == 90
    assert winner["best_sets"] == [
        {"exercise_index": 0, "set_index": 0, "weight": True, "rm": True}
    ]


def test_group_feed_distinguishes_metrics_and_batches_multiple_members(client, connection):
    from uuid import uuid4

    from app.domain.session import SessionUpdate
    from app.infrastructure.sessions import SessionRepository
    from tests.test_session_performance import CountingConnection
    from tests.test_sharing import USERS, create_group
    from tests.test_workout import payload

    group = create_group(client)
    counted = CountingConnection(connection)
    repo = SessionRepository(counted)
    for name in "ABC":
        headers = {"X-Test-User": name}
        client.post("/api/groups/join", json={"invite_code": group["invite_code"]}, headers=headers)
        client.post("/api/workouts", json=payload(exercises=[exercise((80, 10))]), headers=headers)
        session = repo.start(USERS[name], uuid4())
        repo.save_session(
            USERS[name],
            session["id"],
            SessionUpdate(expected_revision=1, exercises=[exercise((85, 1))]),
        )
    counted.calls = 0
    activity = repo.group_activity(USERS["A"], group["id"])
    assert len(activity["feed"]) == 3
    assert all(
        item["best"] and item["best_weight"] and not item["best_rm"] for item in activity["feed"]
    )
    assert counted.calls <= 4

    client.post("/api/workouts", json=payload(exercises=[exercise((85, 1))]))
    feed = repo.group_activity(USERS["B"], group["id"])["feed"]
    assert next(item for item in feed if item["user_id"] == USERS["A"])["best_weight"]
    client.post("/api/workouts", json=payload(exercises=[exercise((90, 1))]))
    feed = repo.group_activity(USERS["B"], group["id"])["feed"]
    assert not next(item for item in feed if item["user_id"] == USERS["A"])["best"]
