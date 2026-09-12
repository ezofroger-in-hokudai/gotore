from uuid import UUID

from psycopg.types.json import Jsonb

from app.domain.session import personal_bests, session_best_sets_from_bests
from app.infrastructure.sessions import SessionRepository
from tests.test_sharing import USERS, create_group
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture

client = client_fixture
connection = connection_fixture


def exercise(*sets, name="ベンチプレス"):
    return {"name": name, "sets": [{"weight": w, "reps": r} for w, r in sets]}


def test_statistics_match_rm_rounding_zero_and_rep_boundaries(client, connection):
    create_group(client)
    repo = SessionRepository(connection)
    identifier = UUID(int=1234)
    connection.execute(
        """INSERT INTO public.gotore_workouts (id, user_id, performed_on, exercises)
        VALUES (%s, %s, '2020-01-01', %s)""",
        (identifier, USERS["A"], Jsonb([exercise((1000, 10), name="別の種目")])),
    )
    assert repo.bests(USERS["A"], "ベンチプレス") == {"best_weight": None, "best_rm": None}
    for weight in [0, 0.1, 0.5, 1.5, 77.5, 82.5, 999.9]:
        for reps in [1, 2, 3, 8, 10, 11, 1000]:
            current = exercise((weight, reps))
            connection.execute(
                "UPDATE public.gotore_workouts SET exercises = %s WHERE id = %s",
                (Jsonb([current, exercise((1000, 10), name="別の種目")]), identifier),
            )
            assert repo.bests(USERS["A"], "ベンチプレス") == personal_bests(current["sets"])
    duplicate = [exercise((80, 8)), exercise((85, 1), (75, 10))]
    connection.execute(
        "UPDATE public.gotore_workouts SET exercises = %s WHERE id = %s",
        (Jsonb(duplicate), identifier),
    )
    expected = personal_bests([s for e in duplicate for s in e["sets"]])
    assert repo.bests(USERS["A"], "ベンチプレス") == expected
    assert repo.bests(USERS["B"], "ベンチプレス") == {"best_weight": None, "best_rm": None}
    connection.execute("DELETE FROM public.gotore_workouts WHERE id = %s", (identifier,))
    assert repo.bests(USERS["A"], "ベンチプレス") == {"best_weight": None, "best_rm": None}


def test_previous_uses_day_time_id_order_and_keeps_duplicate_rows(client, connection):
    create_group(client)
    repo = SessionRepository(connection)
    current = UUID(int=100)
    repo.start(USERS["A"], current)
    connection.execute(
        """UPDATE public.gotore_workouts SET performed_on = '2026-01-02',
            started_at = '2026-01-02T00:00:00Z' WHERE id = %s""",
        (current,),
    )
    # 同日同時刻でも現在IDより後は前回にしない。performed_onが時刻より優先する。
    for identifier, day, timestamp, exercises in [
        (
            50,
            "2026-01-02",
            "2026-01-02T00:00:00Z",
            [
                exercise((40, 6)),
                exercise((999, 10), name="別の種目"),
                exercise((45, 7)),
            ],
        ),
        (200, "2026-01-02", "2026-01-02T00:00:00Z", [exercise((250, 1))]),
        (300, "2026-01-03", "2026-01-01T00:00:00Z", [exercise((300, 1))]),
        (20, "2026-01-01", "2026-01-10T00:00:00Z", [exercise((30, 5))]),
    ]:
        connection.execute(
            """INSERT INTO public.gotore_workouts
                (id, user_id, performed_on, created_at, exercises)
            VALUES (%s, %s, %s, %s, %s)""",
            (UUID(int=identifier), USERS["A"], day, timestamp, Jsonb(exercises)),
        )
    context = repo.context(USERS["A"], "ベンチプレス", current)
    assert context["previous"]["id"] == UUID(int=50)
    assert context["previous"]["sets"] == exercise((40, 6), (45, 7))["sets"]
    assert context["best_weight"] == 300
    assert repo.context(USERS["A"], "ベンチプレス", None)["previous"]["id"] == UUID(int=300)
    connection.execute("DELETE FROM public.gotore_workouts WHERE id = %s", (UUID(int=50),))
    assert repo.context(USERS["A"], "ベンチプレス", current)["previous"]["id"] == UUID(int=20)
    assert repo.context(USERS["A"], "未実施の種目", current)["previous"] is None


def test_overview_does_not_mutate_baseline_and_keeps_only_current_bests():
    baseline = {"ベンチプレス": {"best_weight": 80, "best_rm": 80}}
    assert session_best_sets_from_bests(
        [exercise((82.5, 1)), exercise((85, 1), (75, 10), (75, 10))],
        baseline,
    ) == [{"exercise_index": 1, "set_index": 0}, {"exercise_index": 1, "set_index": 1}]
    assert baseline == {"ベンチプレス": {"best_weight": 80, "best_rm": 80}}
