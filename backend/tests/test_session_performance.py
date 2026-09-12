import json
from uuid import uuid4

from psycopg.types.json import Jsonb

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
    # 終了3往復に、SCOREの根拠一括取得と保存の2往復を加える。
    assert counted.calls <= 5


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


def test_best_feed_batches_history_for_multiple_members(client, connection):
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
        for revision, weights in [(1, [80]), (2, [80, 85])]:
            repo.save_session(
                USERS[name],
                session["id"],
                SessionUpdate(
                    expected_revision=revision,
                    exercises=[
                        {
                            "name": "ベンチプレス",
                            "sets": [{"weight": weight, "reps": 8} for weight in weights],
                        }
                    ],
                ),
            )
    counted.calls = 0
    activity = repo.group_activity(USERS["A"], group["id"])
    assert len(activity["feed"]) == 3
    assert all(item["best"] for item in activity["feed"])
    assert counted.calls <= 5


class MeasuringCursor:
    def __init__(self, cursor, owner):
        self.cursor = cursor
        self.owner = owner

    def measure(self, value):
        self.owner.read_bytes += len(json.dumps(value, default=str).encode())
        return value

    def fetchone(self):
        return self.measure(self.cursor.fetchone())

    def fetchall(self):
        return self.measure(self.cursor.fetchall())


class MeasuringConnection(CountingConnection):
    def __init__(self, connection):
        super().__init__(connection)
        self.read_bytes = 0

    def execute(self, *args, **kwargs):
        return MeasuringCursor(super().execute(*args, **kwargs), self)


def test_context_and_overview_read_only_selected_data(client, connection):
    create_group(client)
    connection.execute(
        """INSERT INTO public.gotore_workouts (id, user_id, performed_on, exercises)
        SELECT gen_random_uuid(), %s, '2020-01-01'::date, %s
        FROM generate_series(1, 100)""",
        (
            USERS["A"],
            Jsonb(
                [
                    {"name": name, "sets": [{"weight": weight, "reps": 8}] * 30}
                    for name, weight in [("ベンチプレス", 80), ("別の種目", 200)]
                ]
            ),
        ),
    )
    measured = MeasuringConnection(connection)
    repo = SessionRepository(measured)
    session = repo.start(USERS["A"], uuid4())
    session = repo.save_session(
        USERS["A"],
        session["id"],
        SessionUpdate(
            expected_revision=1,
            exercises=[{"name": "ベンチプレス", "sets": [{"weight": 85, "reps": 8}]}],
        ),
    )
    measured.read_bytes = 0
    context = repo.context(USERS["A"], "ベンチプレス", session["id"])
    assert context["best_weight"] == 85
    assert context["previous"]["sets"] == [{"weight": 80, "reps": 8}] * 30
    assert measured.read_bytes < 4096
    measured.read_bytes = 0
    assert repo.overview_bests(USERS["A"], session["id"])["sets"] == [
        {"exercise_index": 0, "set_index": 0}
    ]
    assert measured.read_bytes < 4096
