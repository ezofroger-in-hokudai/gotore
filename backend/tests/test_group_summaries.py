from app.infrastructure.sessions import SessionRepository
from tests.test_sessions import save, start
from tests.test_sharing import USERS, create_group
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture

client = client_fixture
connection = connection_fixture


def test_summaries_match_activity_without_record_data(client, connection, monkeypatch):
    groups = [create_group(client) for _ in range(3)]
    for group in groups[:2]:
        client.post(
            "/api/groups/join",
            json={"invite_code": group["invite_code"]},
            headers={"X-Test-User": "B"},
        )
    session = start(client)
    assert save(client, session).status_code == 200
    expected = {}
    for group in groups[:2]:
        activity = client.get(f"/api/groups/{group['id']}/activity").json()
        activity.pop("feed")
        activity.pop("observed_at")
        expected[group["id"]] = activity

    def no_history(*args, **kwargs):
        raise AssertionError("概要取得で全履歴を読まない")

    monkeypatch.setattr(SessionRepository, "bests", no_history)
    response = client.get("/api/groups/activity/summary", headers={"X-Test-User": "B"})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert len(response.json()) == 2
    for summary in response.json():
        assert summary.pop("observed_at")
        assert summary == expected[summary["group_id"]]
        assert "feed" not in summary
        assert "exercises" not in summary
    assert client.get("/api/groups/activity/summary", headers={"X-Test-User": "C"}).json() == []
    membership = client.get(f"/api/groups/{groups[0]['id']}", headers={"X-Test-User": "B"}).json()
    joined_at = next(
        member["joined_at"] for member in membership["members"] if member["id"] == str(USERS["B"])
    )
    left = client.delete(
        f"/api/groups/{groups[0]['id']}/membership",
        params={"expected_joined_at": joined_at},
        headers={"X-Test-User": "B"},
    )
    assert left.status_code == 204
    assert [
        summary["group_id"]
        for summary in client.get(
            "/api/groups/activity/summary", headers={"X-Test-User": "B"}
        ).json()
    ] == [groups[1]["id"]]


def test_summary_uses_one_membership_scoped_query(client, connection):
    for _ in range(5):
        create_group(client)
    queries = []

    class Counted:
        def execute(self, sql, params=None):
            queries.append(sql)
            return connection.execute(sql, params)

    summaries = SessionRepository(Counted()).group_summaries(USERS["A"])
    assert len(summaries) == 5
    assert len(queries) == 1
    assert "exercises" not in queries[0]


def test_summary_tracks_live_deadline_finish_and_private_records(client, connection):
    from tests.test_workout import payload

    group = create_group(client)
    client.post("/api/workouts", json=payload())
    summary = client.get("/api/groups/activity/summary").json()[0]
    assert (summary["live_count"], summary["today_count"]) == (0, 0)
    session = start(client)
    summary = client.get("/api/groups/activity/summary").json()[0]
    assert summary["group_id"] == group["id"]
    assert (summary["live_count"], summary["today_count"]) == (1, 1)
    assert summary["members"][0]["live_until"]
    connection.execute(
        """UPDATE public.gotore_workouts
        SET last_seen_at = clock_timestamp() - interval '6 minutes' WHERE id = %s""",
        (session["id"],),
    )
    assert client.get("/api/groups/activity/summary").json()[0]["live_count"] == 0
    assert client.post(f"/api/sessions/{session['id']}/heartbeat").status_code == 204
    assert client.get("/api/groups/activity/summary").json()[0]["live_count"] == 1
    response = client.post(
        f"/api/sessions/{session['id']}/finish", json={"expected_revision": session["revision"]}
    )
    assert response.status_code == 200
    summary = client.get("/api/groups/activity/summary").json()[0]
    assert (summary["live_count"], summary["today_count"]) == (0, 1)


def test_summary_requires_authentication(client):
    from app.api.dependencies import current_user
    from app.main import app

    app.dependency_overrides.pop(current_user)
    assert client.get("/api/groups/activity/summary").status_code == 401
