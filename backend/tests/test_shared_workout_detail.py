from uuid import uuid4

import pytest

from tests.test_sessions import save, start
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture
from tests.test_sharing import create_group
from tests.test_workout import payload

client = client_fixture
connection = connection_fixture


def join(client, group, user="B"):
    response = client.post(
        "/api/groups/join",
        json={"invite_code": group["invite_code"]},
        headers={"X-Test-User": user},
    )
    assert response.status_code == 200


def detail_url(group, record):
    return f"/api/groups/{group['id']}/workouts/{record['id']}"


def test_detail_returns_only_the_selected_shared_record(client):
    group = create_group(client)
    other = create_group(client)
    join(client, group)
    selected = client.post(
        "/api/workouts",
        json=payload(
            group_id=group["id"],
            exercises=[
                {
                    "name": "ベンチプレス",
                    "sets": [{"weight": 80.5, "reps": 8}, {"weight": 75, "reps": 10}],
                },
                {"name": "スクワット", "sets": [{"weight": 100, "reps": 5}]},
            ],
        ),
    ).json()
    second = client.post("/api/workouts", json=payload(group_id=other["id"])).json()
    same_day = client.post("/api/workouts", json=payload(group_id=group["id"])).json()
    private = client.post("/api/workouts", json=payload()).json()
    memo = client.put(
        f"/api/workouts/{selected['id']}/memo", json={"content": "本人限定", "expected_revision": 0}
    )
    assert memo.status_code == 200
    response = client.get(detail_url(group, selected), headers={"X-Test-User": "B"})
    assert response.status_code == 200, response.text
    assert response.json() == selected
    assert response.headers["cache-control"] == "no-store"
    assert "本人限定" not in response.text
    assert "memo" not in response.text
    assert second["id"] not in response.text
    assert same_day["id"] not in response.text
    for record in [second, private, {"id": str(uuid4())}]:
        assert (
            client.get(detail_url(group, record), headers={"X-Test-User": "B"}).status_code == 404
        )
    assert client.get(detail_url(group, private)).status_code == 404
    assert client.get(detail_url(group, selected), headers={"X-Test-User": "C"}).status_code == 404


def test_session_detail_hides_other_group_ids_and_empty_sessions(client):
    group = create_group(client)
    other = create_group(client)
    join(client, group)
    session = start(client)
    assert client.get(detail_url(group, session)).status_code == 404
    assert save(client, session).status_code == 200
    for user in ["A", "B"]:
        response = client.get(detail_url(group, session), headers={"X-Test-User": user})
        assert response.status_code == 200, response.text
        assert response.json()["shared_group_ids"] == [group["id"]]
        assert other["id"] not in response.text
        assert response.json()["exercises"]


@pytest.mark.parametrize("action", ["viewer_leaves", "author_leaves", "deleted"])
def test_detail_rechecks_membership_sharing_and_deletion(client, action):
    group = create_group(client)
    join(client, group)
    author = "B" if action == "author_leaves" else "A"
    viewer = "A" if action == "author_leaves" else "B"
    record = client.post(
        "/api/workouts", json=payload(group_id=group["id"]), headers={"X-Test-User": author}
    ).json()
    assert client.get(detail_url(group, record), headers={"X-Test-User": viewer}).status_code == 200
    if action == "deleted":
        response = client.delete(
            f"/api/workouts/{record['id']}", params={"expected_revision": record["revision"]}
        )
    else:
        detail = client.get(f"/api/groups/{group['id']}", headers={"X-Test-User": "B"}).json()
        member = next(m for m in detail["members"] if m["display_name"] == "B")
        response = client.delete(
            f"/api/groups/{group['id']}/membership",
            params={"expected_joined_at": member["joined_at"]},
            headers={"X-Test-User": "B"},
        )
    assert response.status_code == 204, response.text
    assert client.get(detail_url(group, record), headers={"X-Test-User": viewer}).status_code == 404


def test_detail_requires_authentication(client):
    from app.api.dependencies import current_user
    from app.main import app

    group = create_group(client)
    record = client.post("/api/workouts", json=payload(group_id=group["id"])).json()
    app.dependency_overrides.pop(current_user)
    assert client.get(detail_url(group, record)).status_code == 401
