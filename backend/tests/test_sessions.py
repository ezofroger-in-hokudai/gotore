from uuid import uuid4

from tests.test_sharing import USERS, create_group
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture

client = client_fixture
connection = connection_fixture


def start(client):
    response = client.post("/api/sessions", json={"id": str(uuid4())})
    assert response.status_code == 201, response.text
    return response.json()


def save(client, session, weight=80, reps=8):
    return client.patch(
        f"/api/sessions/{session['id']}",
        json={
            "expected_revision": session["revision"],
            "exercises": [{"name": "ベンチプレス", "sets": [{"weight": weight, "reps": reps}]}],
        },
    )


def test_session_shares_to_all_groups_and_restores_without_duplicates(client):
    first = create_group(client)
    second = create_group(client)
    for group in [first, second]:
        client.post(
            "/api/groups/join",
            json={"invite_code": group["invite_code"]},
            headers={"X-Test-User": "B"},
        )
    session = start(client)
    assert set(session["shared_group_ids"]) == {first["id"], second["id"]}
    assert start(client)["id"] == session["id"]
    assert client.get("/api/sessions/active").json()["id"] == session["id"]
    changed = save(client, session)
    assert changed.status_code == 200, changed.text
    assert save(client, session).json() == changed.json()
    for group in [first, second]:
        records = client.get(
            f"/api/groups/{group['id']}/workouts", headers={"X-Test-User": "B"}
        ).json()
        assert [r["id"] for r in records] == [session["id"]]
        stats = client.get(f"/api/groups/{group['id']}/activity").json()
        assert (stats["live_count"], stats["today_count"], stats["member_count"]) == (1, 1, 2)
    assert len(client.get("/api/workouts").json()) == 1
    assert save(client, session, weight=90).status_code == 409
    ended = client.post(
        f"/api/sessions/{session['id']}/finish",
        json={"expected_revision": changed.json()["revision"]},
    )
    assert ended.status_code == 200, ended.text
    assert client.get("/api/sessions/active").json() is None
    stats = client.get(f"/api/groups/{first['id']}/activity").json()
    assert (stats["live_count"], stats["today_count"]) == (0, 1)
    assert start(client)["id"] != session["id"]


def test_expired_live_does_not_erase_session_and_departure_never_reshares(client, connection):
    group = create_group(client)
    client.post(
        "/api/groups/join", json={"invite_code": group["invite_code"]}, headers={"X-Test-User": "B"}
    )
    response = client.post("/api/sessions", json={"id": str(uuid4())}, headers={"X-Test-User": "B"})
    session = response.json()
    assert response.status_code == 201, response.text
    connection.execute(
        """UPDATE public.gotore_workouts SET last_seen_at = now() - interval '6 minutes'
        WHERE id = %s""",
        (session["id"],),
    )
    stats = client.get(f"/api/groups/{group['id']}/activity").json()
    assert (stats["live_count"], stats["today_count"]) == (0, 1)
    assert (
        client.get("/api/sessions/active", headers={"X-Test-User": "B"}).json()["id"]
        == session["id"]
    )
    assert client.post(f"/api/sessions/{session['id']}/heartbeat").status_code == 404
    joined_at = next(
        m["joined_at"]
        for m in client.get(f"/api/groups/{group['id']}").json()["members"]
        if m["id"] == str(USERS["B"])
    )
    assert (
        client.delete(
            f"/api/groups/{group['id']}/membership",
            params={"expected_joined_at": joined_at},
            headers={"X-Test-User": "B"},
        ).status_code
        == 204
    )
    client.post(
        "/api/groups/join", json={"invite_code": group["invite_code"]}, headers={"X-Test-User": "B"}
    )
    client.post(f"/api/sessions/{session['id']}/heartbeat", headers={"X-Test-User": "B"})
    assert client.get(f"/api/groups/{group['id']}/activity").json()["today_count"] == 0


def test_invite_preview_does_not_join_and_only_returns_summary(client):
    group = create_group(client)
    result = client.post(
        "/api/groups/preview",
        json={"invite_code": group["invite_code"]},
        headers={"X-Test-User": "B"},
    )
    assert result.status_code == 200, result.text
    assert set(result.json()) == {"id", "name", "member_count", "already_member"}
    assert client.get("/api/groups", headers={"X-Test-User": "B"}).json() == []


def test_exercise_context_bests_memo_and_undo(client):
    from tests.test_workout import payload

    old = payload(
        exercises=[
            {
                "name": "ベンチプレス",
                "sets": [{"weight": 80, "reps": 8}, {"weight": 75, "reps": 10}],
            }
        ]
    )
    client.post("/api/workouts", json=old)
    session = start(client)
    context = client.get(
        "/api/exercises/context", params={"name": "ベンチプレス", "session_id": session["id"]}
    )
    assert context.status_code == 200, context.text
    assert len(context.json()["previous"]["sets"]) == 2
    assert context.json()["best_rm"] == 101.3
    changed = save(client, session, 82.5).json()
    assert (
        client.get("/api/exercises/context", params={"name": "ベンチプレス"}).json()["best_rm"]
        == 104.5
    )
    undone = client.patch(
        f"/api/sessions/{session['id']}",
        json={"expected_revision": changed["revision"], "exercises": []},
    )
    assert undone.status_code == 200, undone.text
    assert (
        client.get("/api/exercises/context", params={"name": "ベンチプレス"}).json()["best_rm"]
        == 101.3
    )
    memo = client.put(
        "/api/exercises/memo",
        json={"name": "ベンチプレス", "content": "ラック8", "expected_revision": 0},
    )
    assert memo.status_code == 200, memo.text
    assert (
        client.get("/api/exercises/context", params={"name": "ベンチプレス"}).json()["memo"][
            "content"
        ]
        == "ラック8"
    )
    assert (
        client.get(
            "/api/exercises/context", params={"name": "ベンチプレス"}, headers={"X-Test-User": "B"}
        ).json()["memo"]["content"]
        == ""
    )


def test_latest_set_and_best_are_only_new_improvements(client):
    group = create_group(client)
    session = start(client)
    session = save(client, session).json()
    path = f"/api/groups/{group['id']}/activity"
    assert client.get(path).json()["feed"][0]["best"] is False
    exercises = session["exercises"]
    exercises[0]["sets"].append({"weight": 82.5, "reps": 8})
    session = client.patch(
        f"/api/sessions/{session['id']}",
        json={"expected_revision": session["revision"], "exercises": exercises},
    ).json()
    assert client.get(path).json()["feed"][0]["best"] is True
    exercises[0]["sets"].append({"weight": 82.5, "reps": 8})
    session = client.patch(
        f"/api/sessions/{session['id']}",
        json={"expected_revision": session["revision"], "exercises": exercises},
    ).json()
    assert client.get(path).json()["feed"][0]["best"] is False
    exercises.append({"name": "スクワット", "sets": [{"weight": 100, "reps": 5}]})
    session = client.patch(
        f"/api/sessions/{session['id']}",
        json={"expected_revision": session["revision"], "exercises": exercises},
    ).json()
    exercises[0]["sets"][0]["weight"] = 90
    client.patch(
        f"/api/sessions/{session['id']}",
        json={"expected_revision": session["revision"], "exercises": exercises},
    )
    feed = client.get(path).json()["feed"][0]
    assert (feed["exercise"], feed["weight"], feed["best"]) == ("ベンチプレス", 90, False)
    assert "memo" not in feed


def test_legacy_privacy_and_session_permissions_remain(client):
    from tests.test_workout import payload

    group = create_group(client)
    private = client.post("/api/workouts", json=payload()).json()
    session = start(client)
    assert client.get(f"/api/groups/{group['id']}/workouts").json() == []
    for path, method, body in [
        (f"/api/sessions/{session['id']}", "patch", {"expected_revision": 1, "exercises": []}),
        (f"/api/sessions/{session['id']}/finish", "post", {"expected_revision": 1}),
    ]:
        response = getattr(client, method)(path, json=body, headers={"X-Test-User": "B"})
        assert response.status_code == 404
    assert (
        client.get(f"/api/groups/{group['id']}/activity", headers={"X-Test-User": "B"}).status_code
        == 404
    )
    saved = save(client, session).json()
    legacy_update = {
        "expected_revision": saved["revision"],
        "performed_on": saved["performed_on"],
        "exercises": saved["exercises"],
    }
    assert client.patch(f"/api/workouts/{session['id']}", json=legacy_update).status_code == 409
    finish_body = {"expected_revision": saved["revision"]}
    ended = client.post(f"/api/sessions/{session['id']}/finish", json=finish_body)
    assert (
        client.post(f"/api/sessions/{session['id']}/finish", json=finish_body).json()
        == ended.json()
    )
    legacy_update["expected_revision"] = ended.json()["revision"]
    legacy_update["exercises"][0]["sets"][0]["weight"] = 85
    edited = client.patch(f"/api/workouts/{session['id']}", json=legacy_update)
    assert edited.status_code == 200, edited.text
    assert edited.json()["shared_group_ids"] == [group["id"]]
    assert client.get(f"/api/groups/{group['id']}/workouts").json()[0]["id"] != private["id"]


def test_activity_days_survive_ending_and_late_membership_is_not_backfilled(client, connection):
    session = start(client)
    group = create_group(client)
    client.post(f"/api/sessions/{session['id']}/heartbeat")
    assert client.get(f"/api/groups/{group['id']}/activity").json()["today_count"] == 0
    assert client.get("/api/workouts").json() == []
    client.post(f"/api/sessions/{session['id']}/finish", json={"expected_revision": 1})
    assert client.get("/api/workouts").json() == []
    session = start(client)
    connection.execute(
        "DELETE FROM public.gotore_session_days WHERE workout_id = %s", (session["id"],)
    )
    client.post(f"/api/sessions/{session['id']}/heartbeat")
    day = connection.execute(
        "SELECT day = (now() AT TIME ZONE 'Asia/Tokyo')::date AS today "
        "FROM public.gotore_session_days WHERE workout_id = %s",
        (session["id"],),
    ).fetchone()
    assert day["today"]


def test_session_rls_and_share_owner_constraints(client, connection):
    import psycopg
    import pytest

    group = create_group(client)
    client.post(
        "/api/groups/join", json={"invite_code": group["invite_code"]}, headers={"X-Test-User": "B"}
    )
    session = start(client)
    other = create_group(client)
    client.post(
        "/api/groups/join", json={"invite_code": other["invite_code"]}, headers={"X-Test-User": "B"}
    )
    with pytest.raises(psycopg.errors.ForeignKeyViolation), connection.transaction():
        connection.execute(
            "INSERT INTO public.gotore_workout_shares (workout_id, group_id, user_id) "
            "VALUES (%s, %s, %s)",
            (session["id"], other["id"], USERS["B"]),
        )
    with connection.transaction(force_rollback=True):
        connection.execute("""DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                CREATE ROLE authenticated NOLOGIN;
            END IF;
        END $$""")
        connection.execute("GRANT USAGE ON SCHEMA public TO authenticated")
        connection.execute("""GRANT SELECT, INSERT ON public.gotore_workout_shares,
            public.gotore_session_days, public.gotore_exercise_memos TO authenticated""")
        connection.execute("SET LOCAL ROLE authenticated")
        for table in ["gotore_workout_shares", "gotore_session_days", "gotore_exercise_memos"]:
            assert connection.execute(f"SELECT * FROM public.{table}").fetchall() == []
        with pytest.raises(psycopg.errors.InsufficientPrivilege), connection.transaction():
            connection.execute(
                "INSERT INTO public.gotore_exercise_memos (user_id, name, content, revision) "
                "VALUES (%s, 'fake', 'fake', 1)",
                (USERS["A"],),
            )


def test_group_workout_does_not_expose_other_group_ids(client):
    first = create_group(client)
    second = create_group(client)
    client.post(
        "/api/groups/join", json={"invite_code": first["invite_code"]}, headers={"X-Test-User": "B"}
    )
    save(client, start(client))
    result = client.get(f"/api/groups/{first['id']}/workouts", headers={"X-Test-User": "B"}).json()[
        0
    ]
    assert result["shared_group_ids"] == [first["id"]]
    assert second["id"] not in str(result)
