from app.domain.session import session_best_sets
from tests.test_sessions import save, start
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture

client = client_fixture
connection = connection_fixture


def exercise(*values):
    return {"name": "ベンチプレス", "sets": [{"weight": w, "reps": r} for w, r in values]}


def test_best_sets_separate_weight_and_rm_and_ignore_equal_or_first_values():
    assert session_best_sets([exercise((80, 8), (80, 8))], []) == []
    assert session_best_sets([exercise((82.5, 1), (75, 10), (75, 10))], [exercise((80, 1))]) == [
        {"exercise_index": 0, "set_index": 0},
        {"exercise_index": 0, "set_index": 1},
    ]
    assert session_best_sets([exercise((80, 8)), exercise((85, 8))], []) == [
        {"exercise_index": 1, "set_index": 0}
    ]


def test_overview_bests_are_owned_and_recomputed_after_edit(client):
    session = start(client)
    session = save(client, session, 80).json()
    path = f"/api/sessions/{session['id']}/bests"
    assert client.get(path).json()["sets"] == []
    session = client.patch(
        f"/api/sessions/{session['id']}",
        json={
            "expected_revision": session["revision"],
            "exercises": [exercise((80, 8), (85, 8), (85, 8))],
        },
    ).json()
    assert client.get(path).json() == {
        "revision": session["revision"],
        "sets": [{"exercise_index": 0, "set_index": 1}],
    }
    assert client.get(path, headers={"X-Test-User": "B"}).status_code == 404
    client.patch(
        f"/api/sessions/{session['id']}",
        json={"expected_revision": session["revision"], "exercises": [exercise((80, 8))]},
    )
    assert client.get(path).json()["sets"] == []
