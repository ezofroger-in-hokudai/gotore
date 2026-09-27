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


def test_today_activity_collects_visible_groups_in_one_response(client, connection):
    first = create_group(client)
    second = client.post("/api/groups", json={"name": "夜トレ部"}).json()
    for group in (first, second):
        response = client.post(
            "/api/groups/join",
            json={"invite_code": group["invite_code"]},
            headers={"X-Test-User": "B"},
        )
        assert response.status_code == 200
    repo = SessionRepository(connection)
    workout = repo.start(USERS["B"], uuid4())
    repo.save_session(
        USERS["B"],
        workout["id"],
        SessionUpdate(
            expected_revision=1,
            exercises=[{"name": "ベンチプレス", "sets": [{"weight": 80, "reps": 8}]}],
        ),
    )

    response = client.get("/api/groups/today-activity")

    assert response.status_code == 200, response.text
    groups = {item["group_id"]: item for item in response.json()["groups"]}
    assert set(groups) == {first["id"], second["id"]}
    assert all(len(item["feed"]) == 1 for item in groups.values())
    assert all(item["feed"][0]["user_id"] == str(USERS["B"]) for item in groups.values())
    assert all(item["feed"][0]["summary"]["total_volume"] == 640 for item in groups.values())
    assert response.json()["totals"] == {"set_count": 1, "total_volume": 640}
    assert all(item["totals"] == {"set_count": 1, "total_volume": 640} for item in groups.values())
    counted = CountingConnection(connection)
    assert SessionRepository(counted).today_totals(USERS["A"])[0] == {
        "set_count": 1,
        "total_volume": 640,
    }
    assert counted.calls == 1


def test_today_totals_include_records_beyond_feed_limit_and_deduplicate_shares(client, connection):
    first = create_group(client)
    second = client.post("/api/groups", json={"name": "夜トレ部"}).json()
    for group in (first, second):
        assert client.post(
            "/api/groups/join",
            json={"invite_code": group["invite_code"]},
            headers={"X-Test-User": "B"},
        ).status_code == 200

    def totals():
        response = client.get("/api/groups/today-activity")
        assert response.status_code == 200, response.text
        data = response.json()
        return data["totals"], {group["group_id"]: group for group in data["groups"]}

    overall, groups = totals()
    assert overall == {"set_count": 0, "total_volume": 0}
    assert all(group["totals"] == overall for group in groups.values())

    def insert(count):
        rows = connection.execute(
            """INSERT INTO public.gotore_workouts (id, user_id, performed_on, exercises)
            SELECT gen_random_uuid(), %s,
              (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date, %s
            FROM generate_series(1, %s) RETURNING id""",
            (
                USERS["B"],
                Jsonb([{"name": "ベンチプレス", "sets": [{"weight": 80, "reps": 8}]}]),
                count,
            ),
        ).fetchall()
        ids = [row["id"] for row in rows]
        connection.execute(
            """INSERT INTO public.gotore_workout_shares (workout_id, group_id, user_id)
            SELECT id, %s, user_id FROM public.gotore_workouts WHERE id = ANY(%s::uuid[])""",
            (first["id"], ids),
        )
        return ids

    first_id = insert(1)[0]
    connection.execute(
        """INSERT INTO public.gotore_workout_shares (workout_id, group_id, user_id)
        VALUES (%s, %s, %s)""",
        (first_id, second["id"], USERS["B"]),
    )
    for size, count in [(1, 0), (50, 49), (51, 1)]:
        if count:
            insert(count)
        overall, groups = totals()
        assert overall == {"set_count": size, "total_volume": 640 * size}
        assert groups[first["id"]]["totals"] == overall
        assert groups[second["id"]]["totals"] == {"set_count": 1, "total_volume": 640}
        assert len(groups[first["id"]]["feed"]) == min(size, 50)

    connection.execute(
        """UPDATE public.gotore_workouts SET exercises = %s WHERE id = %s""",
        (Jsonb([{"name": "ベンチプレス", "sets": [{"weight": 100, "reps": 8}]}]), first_id),
    )
    overall, groups = totals()
    assert overall == {"set_count": 51, "total_volume": 51 * 640 + 160}
    assert groups[second["id"]]["totals"] == {"set_count": 1, "total_volume": 800}

    connection.execute(
        "DELETE FROM public.gotore_workout_shares WHERE workout_id = %s AND group_id = %s",
        (first_id, first["id"]),
    )
    overall, groups = totals()
    assert overall == {"set_count": 51, "total_volume": 51 * 640 + 160}
    assert groups[first["id"]]["totals"] == {"set_count": 50, "total_volume": 50 * 640}

    connection.execute("DELETE FROM public.gotore_workouts WHERE id = %s", (first_id,))
    overall, groups = totals()
    assert overall == groups[first["id"]]["totals"] == {
        "set_count": 50,
        "total_volume": 50 * 640,
    }
    assert groups[second["id"]]["totals"] == {"set_count": 0, "total_volume": 0}

    connection.execute(
        "DELETE FROM public.gotore_group_members WHERE group_id = %s AND user_id = %s",
        (first["id"], USERS["B"]),
    )
    overall, groups = totals()
    assert overall == {"set_count": 0, "total_volume": 0}
    assert groups[first["id"]]["totals"] == overall


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
    assert all(
        item["summary"] == {"exercise_count": 1, "set_count": 1, "total_volume": 640}
        for item in activity["feed"]
    )
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
        {"exercise_index": 0, "set_index": 0, "weight": True, "rm": True}
    ]
    assert measured.read_bytes < 4096
