from tests.test_sharing import USERS, create_group
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture
from tests.test_workout import payload

client = client_fixture
connection = connection_fixture
B = {"X-Test-User": "B"}
C = {"X-Test-User": "C"}


def setup(client):
    group = create_group(client)
    client.post("/api/groups/join", headers=B, json={"invite_code": group["invite_code"]})
    record = client.post("/api/workouts", json=payload(group_id=group["id"])).json()
    path = f"/api/groups/{group['id']}/workouts/{record['id']}/stamps"
    return group, record, path


def test_send_scope_idempotency_and_self(client):
    group, record, path = setup(client)
    assert client.put(path + "/clap", headers=B).status_code == 200
    assert client.put(path + "/clap", headers=B).status_code == 200
    assert client.put(path + "/fire", headers=B).status_code == 200
    data = client.get(path, headers=B).json()
    assert data["can_send"] is True
    assert len(data["items"]) == 2
    assert all(r["sender_id"] == str(USERS["B"]) for r in data["items"])
    assert client.put(path + "/clap").status_code == 409
    assert client.put(path + "/invalid", headers=B).status_code == 422
    assert client.get(path, headers=C).status_code == 404
    other = create_group(client)
    client.post("/api/groups/join", headers=B, json={"invite_code": other["invite_code"]})
    wrong = f"/api/groups/{other['id']}/workouts/{record['id']}/stamps"
    assert client.get(wrong, headers=B).status_code == 404
    private = client.post("/api/workouts", json=payload()).json()
    assert (
        client.put(
            f"/api/groups/{group['id']}/workouts/{private['id']}/stamps/clap", headers=B
        ).status_code
        == 404
    )
    assert client.delete(path + "/clap", headers=B).status_code == 204
    assert client.delete(path + "/clap", headers=B).status_code == 204
    assert len(client.get(path).json()["items"]) == 1


def test_inbox_receipt_read_and_resend(client):
    _, record, path = setup(client)
    client.put(path + "/clap", headers=B)
    inbox = "/api/stamps/inbox?workout_id=" + record["id"]
    data = client.get(inbox).json()
    assert data["unread"] == 1 and data["total"] == 1 and data["people"] == 1
    item = data["items"][0]
    assert not item["announced"] and not item["read"]
    assert (
        client.post(
            "/api/stamps/seen", headers=B, json={"ids": [item["id"]], "read": True}
        ).status_code
        == 204
    )
    assert client.get(inbox).json()["unread"] == 1
    assert (
        client.post("/api/stamps/seen", json={"ids": [item["id"]], "read": False}).status_code
        == 204
    )
    data = client.get(inbox).json()
    assert data["items"][0]["announced"] and data["unread"] == 1
    client.post("/api/stamps/seen", json={"ids": [item["id"]], "read": True})
    assert client.get(inbox).json()["unread"] == 0
    assert client.get("/api/stamps/inbox", headers=B).json()["total"] == 0
    client.delete(path + "/clap", headers=B)
    client.put(path + "/clap", headers=B)
    assert client.get(inbox).json()["items"][0]["id"] != item["id"]


def test_edit_leave_and_delete_remove_reactions(client, connection):
    group, record, path = setup(client)
    client.put(path + "/clap", headers=B)
    connection.execute(
        "UPDATE public.gotore_workouts SET performed_on='2026-09-10' WHERE id=%s", (record["id"],)
    )
    assert client.get("/api/stamps/inbox").json()["items"][0]["performed_on"] == "2026-09-10"
    member = next(
        m
        for m in client.get("/api/groups/" + group["id"]).json()["members"]
        if m["id"] == str(USERS["B"])
    )
    response = client.delete(
        f"/api/groups/{group['id']}/members/{USERS['B']}",
        params={"expected_joined_at": member["joined_at"]},
    )
    assert response.status_code == 204
    assert client.get("/api/stamps/inbox").json()["total"] == 0
    client.post("/api/groups/join", headers=B, json={"invite_code": group["invite_code"]})
    assert client.get(path).json()["items"] == []
    client.put(path + "/clap", headers=B)
    connection.execute("DELETE FROM public.gotore_workouts WHERE id=%s", (record["id"],))
    assert client.get("/api/stamps/inbox").json()["total"] == 0


def test_group_isolation_and_share_removal(client, connection):
    group, record, path = setup(client)
    other = create_group(client)
    client.post("/api/groups/join", headers=B, json={"invite_code": other["invite_code"]})
    connection.execute(
        "INSERT INTO public.gotore_workout_shares (workout_id,user_id,group_id) VALUES (%s,%s,%s)",
        (record["id"], USERS["A"], other["id"]),
    )
    other_path = f"/api/groups/{other['id']}/workouts/{record['id']}/stamps"
    client.put(path + "/clap", headers=B)
    client.put(other_path + "/fire", headers=B)
    assert [r["kind"] for r in client.get(path).json()["items"]] == ["clap"]
    assert [r["kind"] for r in client.get(other_path).json()["items"]] == ["fire"]
    assert client.get("/api/stamps/inbox?group_id=" + group["id"]).json()["total"] == 1
    connection.execute(
        "DELETE FROM public.gotore_workout_shares WHERE workout_id=%s AND group_id=%s",
        (record["id"], other["id"]),
    )
    assert client.get("/api/stamps/inbox").json()["total"] == 1
    assert client.get(other_path, headers=B).status_code == 404


def test_empty_session_and_unsharing_do_not_leave_stamps(client, connection):
    from uuid import uuid4

    group, record, path = setup(client)
    started = client.post("/api/sessions", json={"id": str(uuid4())}).json()
    empty_path = f"/api/groups/{group['id']}/workouts/{started['id']}/stamps/clap"
    assert client.put(empty_path, headers=B).status_code == 404
    client.put(path + "/clap", headers=B)
    connection.execute(
        "UPDATE public.gotore_workouts SET group_id=NULL WHERE id=%s", (record["id"],)
    )
    assert client.get("/api/stamps/inbox").json()["total"] == 0
    connection.execute(
        "UPDATE public.gotore_workouts SET group_id=%s WHERE id=%s", (group["id"], record["id"])
    )
    assert client.get(path).json()["items"] == []


def test_inbox_pagination_only_marks_visible_ids(client, connection):
    from uuid import uuid4

    group, record, path = setup(client)
    client.put(path + "/clap", headers=B)
    for _ in range(51):
        wid = uuid4()
        connection.execute(
            "INSERT INTO public.gotore_workouts (id,user_id,group_id,performed_on,exercises) "
            "SELECT %s,user_id,group_id,performed_on,exercises "
            "FROM public.gotore_workouts WHERE id=%s",
            (wid, record["id"]),
        )
        connection.execute(
            "INSERT INTO public.gotore_workout_stamps "
            "(workout_id,recipient_id,group_id,sender_id,kind) "
            "VALUES (%s,%s,%s,%s,'clap')",
            (wid, USERS["A"], group["id"], USERS["B"]),
        )
    first = client.get("/api/stamps/inbox").json()
    assert first["total"] == 52 and len(first["items"]) == 50 and first["has_more"]
    client.post("/api/stamps/seen", json={"ids": [r["id"] for r in first["items"]], "read": True})
    last = client.get("/api/stamps/inbox?offset=50").json()
    assert last["unread"] == 2 and len(last["items"]) == 2 and not last["has_more"]
    assert client.get("/api/stamps/inbox?offset=-1").status_code == 422


def test_stamps_are_not_accessible_directly_from_browser_roles(client, connection):
    import psycopg
    import pytest

    setup(client)
    for role in ["anon", "authenticated"]:
        with pytest.raises(psycopg.errors.InsufficientPrivilege), connection.transaction():
            connection.execute("SET LOCAL ROLE " + role)
            connection.execute("SELECT * FROM public.gotore_workout_stamps").fetchall()


def test_batch_counts_new_kinds_and_scope(client):
    group, record, path = setup(client)
    batch = f"/api/groups/{group['id']}/stamps/summary"
    for kind in ("encourage", "push", "bad", "amazing", "praise", "tengu", "clap"):
        assert client.put(path + "/" + kind, headers=B).status_code == 200
    result = client.post(batch, headers=B, json={"workout_ids": [record["id"]]})
    assert result.status_code == 200
    summary = result.json()[record["id"]]
    assert summary["counts"]["tengu"] == 1
    assert summary["counts"]["clap"] == 1
    assert len(summary["mine"]) == 7
    assert summary["can_send"] is True
    assert client.post(batch, json={"workout_ids": [record["id"]]}).json()[record["id"]][
        "can_send"
    ] is False
    assert client.post(batch, headers=C, json={"workout_ids": [record["id"]]}).status_code == 404
    private = client.post("/api/workouts", json=payload()).json()
    assert client.post(batch, headers=B, json={"workout_ids": [private["id"]]}).json() == {}
    assert client.post(batch, json={"workout_ids": [record["id"]] * 51}).status_code == 422
    assert client.get(path, headers=B).json()["counts"]["tengu"] == 1


def test_batch_counts_are_not_limited_to_first_page(client, connection):
    from uuid import uuid4

    group, record, path = setup(client)
    for _ in range(55):
        user = uuid4()
        connection.execute("INSERT INTO auth.users(id) VALUES (%s)", (user,))
        connection.execute(
            "INSERT INTO public.gotore_profiles(id,display_name) VALUES (%s,'テスト')", (user,)
        )
        connection.execute(
            "INSERT INTO public.gotore_group_members(group_id,user_id) VALUES (%s,%s)",
            (group["id"], user),
        )
        connection.execute(
            "INSERT INTO public.gotore_workout_stamps"
            "(workout_id,recipient_id,group_id,sender_id,kind) VALUES (%s,%s,%s,%s,'tengu')",
            (record["id"], USERS["A"], group["id"], user),
        )
    data = client.get(path, headers=B).json()
    assert len(data["items"]) == 50 and data["counts"]["tengu"] == 55
    result = client.post(
        f"/api/groups/{group['id']}/stamps/summary",
        headers=B,
        json={"workout_ids": [record["id"]]},
    ).json()
    assert result[record["id"]]["counts"]["tengu"] == 55
