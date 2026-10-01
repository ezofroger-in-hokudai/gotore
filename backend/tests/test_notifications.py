import base64
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.notifications import PushSubscription
from app.services.notification_dispatch import dispatch
from tests.test_sharing import USERS, create_group
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture


def test_subscription_rejects_local_and_untrusted_endpoints():
    for endpoint in [
        "http://127.0.0.1/push",
        "https://localhost/push",
        "https://example.com/push",
        "https://fcm.googleapis.com@127.0.0.1/push",
    ]:
        with pytest.raises(ValidationError):
            PushSubscription(endpoint=endpoint, keys={"p256dh": "x", "auth": "x"})


client = client_fixture
connection = connection_fixture
B = {"X-Test-User": "B"}
C = {"X-Test-User": "C"}


def subscription():
    def enc(x):
        return base64.urlsafe_b64encode(x).rstrip(b"=").decode()

    return {
        "endpoint": "https://fcm.googleapis.com/fcm/send/" + str(uuid4()),
        "keys": {"p256dh": enc(b"\x04" + bytes(64)), "auth": enc(bytes(16))},
    }


def setup_notifications(client):
    group = create_group(client)
    client.post("/api/groups/join", headers=B, json={"invite_code": group["invite_code"]})
    another = create_group(client)
    client.post("/api/groups/join", headers=B, json={"invite_code": another["invite_code"]})
    return group


def test_start_is_deduplicated_for_multiple_groups_and_seen_is_owned(client):
    setup_notifications(client)
    session = client.post("/api/sessions", headers=B, json={"id": str(uuid4())}).json()
    data = client.get("/api/notifications/inbox").json()
    assert len(data["items"]) == 1 and data["items"][0]["kind"] == "start"
    event = data["items"][0]["id"]
    assert client.get("/api/notifications/inbox", headers=C).json()["items"] == []
    client.post("/api/notifications/seen", headers=B, json={"ids": [event]})
    assert len(client.get("/api/notifications/inbox").json()["items"]) == 1
    client.post("/api/notifications/seen", json={"ids": [event]})
    assert client.get("/api/notifications/inbox").json()["items"] == []
    assert event in client.get("/api/notifications/inbox").json()["live_start_ids"]
    client.post(
        "/api/sessions/" + session["id"] + "/finish", headers=B, json={"expected_revision": 1}
    )
    assert client.get("/api/notifications/inbox").json()["live_start_ids"] == []


def test_start_ends_or_leaves_before_viewing_is_not_presented(client):
    setup_notifications(client)
    session = client.post("/api/sessions", headers=B, json={"id": str(uuid4())}).json()
    client.post(
        "/api/sessions/" + session["id"] + "/finish", headers=B, json={"expected_revision": 1}
    )
    assert client.get("/api/notifications/inbox").json()["items"] == []


def test_stamp_events_and_settings_are_saved_without_duplicate_send(client):
    from tests.test_stamps import setup

    group, record, path = setup(client)
    client.put(path + "/push", headers=B)
    client.put(path + "/push", headers=B)
    data = client.get("/api/notifications/inbox").json()["items"]
    assert len(data) == 1 and data[0]["stamp_kind"] == "push"
    client.post("/api/notifications/seen", json={"ids": [data[0]["id"]]})
    assert client.get("/api/stamps/inbox").json()["items"][0]["announced"]
    value = client.get("/api/notifications/settings").json()
    assert value["vibration"] and not value["sound"]
    value["start_timing"] = "now"
    value["push_stamp"] = False
    assert client.put("/api/notifications/settings", json=value).json() == value
    assert client.get("/api/notifications/settings").json() == value
    assert client.get("/api/notifications/settings", headers=B).json()["push_stamp"]
    assert (
        client.put(
            "/api/notifications/settings", json={**value, "start_timing": "invalid"}
        ).status_code
        == 422
    )


def test_subscription_ownership_outbox_retry_and_private_payload(client, connection, monkeypatch):
    from pywebpush import WebPushException

    from tests.test_stamps import setup

    setup_notifications(client)
    sub = subscription()
    sid = client.put("/api/notifications/subscription", json=sub).json()["id"]
    connection.execute("UPDATE public.gotore_push_subscriptions SET last_active_at=NULL")
    group, record, path = setup(client)
    client.put(path + "/push", headers=B)
    deliveries = connection.execute("SELECT * FROM public.gotore_push_deliveries").fetchall()
    assert len(deliveries) == 1
    monkeypatch.setattr(settings, "vapid_private_key", "test-private")
    calls = []

    def fail(**kw):
        calls.append(kw)
        raise WebPushException("temporary")

    assert dispatch(connection, fail) == 1
    row = connection.execute("SELECT * FROM public.gotore_push_deliveries").fetchone()
    assert row["attempts"] == 1 and row["delivered_at"] is None
    connection.execute("UPDATE public.gotore_push_deliveries SET next_attempt_at=clock_timestamp()")
    assert dispatch(connection, lambda **kw: calls.append(kw)) == 1
    assert connection.execute("SELECT delivered_at FROM public.gotore_push_deliveries").fetchone()[
        "delivered_at"
    ]
    import json

    assert json.loads(calls[-1]["data"]) == {"kind": "stamp", "count": 1}
    assert client.get("/api/notifications/inbox").json()["items"]  # OS配信でアプリ内既読にしない
    client.request(
        "DELETE", "/api/notifications/subscription", headers=B, json={"endpoint": sub["endpoint"]}
    )
    assert connection.execute("SELECT id FROM public.gotore_push_subscriptions").fetchone()
    new = client.put("/api/notifications/subscription", headers=B, json=sub).json()["id"]
    assert new != sid
    assert (
        connection.execute("SELECT user_id FROM public.gotore_push_subscriptions").fetchone()[
            "user_id"
        ]
        == USERS["B"]
    )


def test_foreground_is_deferred_and_permission_off_suppresses_push(client, connection):
    from tests.test_stamps import setup

    group, record, path = setup(client)
    sub = subscription()
    client.put("/api/notifications/subscription", json=sub)
    client.put(path + "/push", headers=B)
    calls = []
    dispatch(connection, lambda **kw: calls.append(kw))
    assert not calls
    row = connection.execute(
        "SELECT delivered_at,attempts FROM public.gotore_push_deliveries"
    ).fetchone()
    assert row["delivered_at"] is None and row["attempts"] == 0
    value = client.get("/api/notifications/settings").json()
    client.put("/api/notifications/settings", json={**value, "push_stamp": False})
    connection.execute("UPDATE public.gotore_push_deliveries SET next_attempt_at=clock_timestamp()")
    dispatch(connection, lambda **kw: calls.append(kw))
    assert not calls
    assert connection.execute("SELECT delivered_at FROM public.gotore_push_deliveries").fetchone()[
        "delivered_at"
    ]


def test_ended_or_unshared_start_never_leaks_through_push(client, connection):
    setup_notifications(client)
    client.put("/api/notifications/subscription", json=subscription())
    session = client.post("/api/sessions", headers=B, json={"id": str(uuid4())}).json()
    connection.execute(
        "DELETE FROM public.gotore_workout_shares WHERE workout_id=%s", (session["id"],)
    )
    assert client.get("/api/notifications/inbox").json()["items"] == []
    calls = []
    dispatch(connection, lambda **kw: calls.append(kw))
    assert not calls
