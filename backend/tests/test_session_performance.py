from uuid import uuid4

from app.domain.session import SessionUpdate
from app.infrastructure.sessions import SessionRepository
from tests.test_sharing import USERS, create_group
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture

client = client_fixture
connection = connection_fixture


class CountingConnection:
    def __init__(self, connection):
        self.connection = connection
        self.calls = 0

    def execute(self, *args, **kwargs):
        self.calls += 1
        return self.connection.execute(*args, **kwargs)

    def transaction(self):
        return self.connection.transaction()


def test_session_round_trips_stay_bounded_with_multiple_groups(client, connection):
    groups = [create_group(client) for _ in range(4)]
    counted = CountingConnection(connection)
    repo = SessionRepository(counted)
    session = repo.start(USERS["A"], uuid4())
    assert {str(value) for value in session["shared_group_ids"]} == {g["id"] for g in groups}
    assert counted.calls <= 7

    counted.calls = 0
    session = repo.save_session(
        USERS["A"],
        session["id"],
        SessionUpdate(
            expected_revision=1,
            exercises=[{"name": "ベンチプレス", "sets": [{"weight": 80, "reps": 8}]}],
        ),
    )
    assert session["revision"] == 2
    assert len(session["shared_group_ids"]) == 4
    assert counted.calls <= 4

    counted.calls = 0
    repo.heartbeat(USERS["A"], session["id"])
    assert counted.calls <= 2

    counted.calls = 0
    finished = repo.finish(USERS["A"], session["id"], 2)
    assert finished["ended_at"] is not None
    assert finished["revision"] == 3
    assert len(finished["shared_group_ids"]) == 4
    assert counted.calls <= 3


def test_ordinary_feed_does_not_fetch_each_members_private_history(client, connection):
    group = create_group(client)
    counted = CountingConnection(connection)
    repo = SessionRepository(counted)
    for name in "ABC":
        client.post(
            "/api/groups/join",
            json={"invite_code": group["invite_code"]},
            headers={"X-Test-User": name},
        )
        session = repo.start(USERS[name], uuid4())
        repo.save_session(
            USERS[name],
            session["id"],
            SessionUpdate(
                expected_revision=1,
                exercises=[{"name": "ベンチプレス", "sets": [{"weight": 80, "reps": 8}]}],
            ),
        )
    counted.calls = 0
    activity = repo.group_activity(USERS["A"], group["id"])
    assert len(activity["feed"]) == 3
    assert all(not item["best"] for item in activity["feed"])
    assert counted.calls <= 4
