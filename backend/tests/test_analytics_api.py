from datetime import date
from pathlib import Path

import pytest

from app.domain import activity
from tests.test_sharing import USERS, create_group
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture
from tests.test_workout import payload

client = client_fixture
connection = connection_fixture


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr(activity, "today_in_japan", lambda: date(2026, 9, 11))


def save(client, user="A", day="2026-09-01", group=None, weight=60, reps=10, name="ベンチ"):
    response = client.post(
        "/api/workouts",
        headers={"X-Test-User": user},
        json=payload(
            performed_on=day,
            group_id=group,
            exercises=[{"name": name, "sets": [{"weight": weight, "reps": reps}]}],
        ),
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_personal_statistics_include_private_and_old_rows_but_not_other_users(client):
    save(client)
    save(client, weight=0, reps=15)
    save(client, day="2020-01-01", weight=100, reps=1)
    save(client, user="B", weight=900)
    data = client.get("/api/analytics?period=all&exercise=ベンチ").json()
    assert data["totals"] == {
        "sets": 3,
        "volume": 700,
        "weight": 100,
        "rm": 100,
        "days": 2,
        "people": 1,
    }
    assert data["exercises"] == ["ベンチ"]
    assert client.get("/api/analytics?period=month&offset=9999").status_code == 422
    assert client.get("/api/analytics?period=all&offset=1").status_code == 422
    assert client.get("/api/analytics?exercise=不存在").json()["totals"]["sets"] == 0
    assert client.get("/api/analytics").headers["cache-control"] == "no-store"


def test_group_scope_ties_and_revoked_access(client, connection):
    group = create_group(client)
    gid = group["id"]
    client.post(
        "/api/groups/join", headers={"X-Test-User": "B"}, json={"invite_code": group["invite_code"]}
    )
    a = save(client, group=gid)
    save(client, user="B", group=gid)
    save(client, user="B", weight=900)
    endpoint = f"/api/groups/{gid}/analytics?exercise=ベンチ"
    data = client.get(endpoint).json()
    assert data["totals"]["sets"] == 2
    assert data["totals"]["people"] == 2
    assert [r["rank"] for r in data["rankings"]["weight"]] == [1, 1]
    assert client.get(endpoint, headers={"X-Test-User": "C"}).status_code == 404
    # 旧共有とv2共有が併存しても1記録として集計する。
    connection.execute(
        "INSERT INTO public.gotore_workout_shares (workout_id, user_id, group_id) "
        "VALUES (%s, %s, %s)",
        (a["id"], USERS["A"], gid),
    )
    assert client.get(endpoint).json()["totals"]["sets"] == 2
    members = client.get(f"/api/groups/{gid}").json()["members"]
    joined = next(m["joined_at"] for m in members if m["id"] == str(USERS["B"]))
    response = client.delete(
        f"/api/groups/{gid}/members/{USERS['B']}", params={"expected_joined_at": joined}
    )
    assert response.status_code == 204, response.text
    assert client.get(endpoint).json()["totals"]["sets"] == 1
    assert client.get(endpoint, headers={"X-Test-User": "B"}).status_code == 404


def test_projection_follows_edit_date_delete_and_rollback(client, connection):
    record = save(client)
    before = connection.execute("SELECT * FROM public.gotore_workout_statistics").fetchall()
    with connection.transaction(force_rollback=True):
        connection.execute(
            "UPDATE public.gotore_workouts SET exercises = %s::jsonb, "
            "performed_on = '2026-08-01' WHERE id = %s",
            ('[{"name":"スクワット","sets":[{"weight":80.5,"reps":8}]}]', record["id"]),
        )
        current = client.get("/api/analytics?period=month&exercise=スクワット").json()
        assert current["totals"]["sets"] == 0
        assert current["previous_totals"]["volume"] == 644
        assert current["previous_totals"]["rm"] == 102
        assert current["exercises"] == ["スクワット"]
    assert connection.execute("SELECT * FROM public.gotore_workout_statistics").fetchall() == before
    connection.execute("DELETE FROM public.gotore_workouts WHERE id = %s", (record["id"],))
    assert (
        connection.execute("SELECT count(*) AS n FROM public.gotore_workout_statistics").fetchone()[
            "n"
        ]
        == 0
    )
    assert client.get("/api/analytics").json()["totals"]["sets"] == 0


def test_projection_backfill_and_rm_match_domain(client, connection):
    from app.domain.session import estimated_rm

    for weight, reps in [(0, 10), (80.5, 8), (60.1, 1), (60.1, 2), (60.1, 10), (60.1, 11)]:
        record = save(client, weight=weight, reps=reps)
        row = connection.execute(
            "SELECT * FROM public.gotore_workout_statistics WHERE workout_id = %s", (record["id"],)
        ).fetchone()
        assert (float(row["best_rm"]) if row["best_rm"] is not None else None) == estimated_rm(
            weight, reps
        )
    connection.execute("DELETE FROM public.gotore_workout_statistics")
    sql = (
        Path(__file__).parents[2] / "supabase/migrations/20260911090000_workout_statistics.sql"
    ).read_text()
    connection.execute(sql[sql.index("-- 既存記録を補完") :])
    assert client.get("/api/analytics").json()["totals"]["sets"] == 6


def test_graph_drilldown_filters_owned_records_by_inclusive_range(client):
    first = save(client, day="2026-09-01")
    last = save(client, day="2026-09-07")
    save(client, day="2026-09-08")
    save(client, user="B", day="2026-09-01")
    response = client.get("/api/workouts?date_from=2026-09-01&date_to=2026-09-07")
    assert {r["id"] for r in response.json()} == {first["id"], last["id"]}
    for query in [
        "date_from=2026-09-02&date_to=2026-09-01",
        "date_from=2026-09-01",
        "date_from=2026-09-01&date_to=2099-09-01",
    ]:
        assert client.get(f"/api/workouts?{query}").status_code == 422


def test_active_sets_undo_and_heartbeat_projection(client, connection):
    from tests.test_sessions import save as save_session
    from tests.test_sessions import start

    group = create_group(client)
    session = start(client)
    # セッション開始のDB時刻によらず、このテストの集計対象日へそろえる。
    connection.execute(
        "UPDATE public.gotore_workouts SET performed_on = '2026-09-11' WHERE id = %s",
        (session["id"],),
    )
    endpoint = f"/api/groups/{group['id']}/analytics?period=all&exercise=ベンチプレス"
    assert client.get(endpoint).json()["totals"]["sets"] == 0
    saved = save_session(client, session, weight=80, reps=8).json()
    assert client.get(endpoint).json()["totals"]["volume"] == 640
    before = connection.execute("SELECT ctid FROM public.gotore_workout_statistics").fetchone()
    assert client.post(f"/api/sessions/{session['id']}/heartbeat").status_code == 204
    assert (
        connection.execute("SELECT ctid FROM public.gotore_workout_statistics").fetchone() == before
    )
    undone = client.patch(
        f"/api/sessions/{session['id']}",
        json={"expected_revision": saved["revision"], "exercises": []},
    )
    assert undone.status_code == 200, undone.text
    assert client.get(endpoint).json()["totals"]["sets"] == 0
    assert client.get(endpoint).json()["exercises"] == []
