import gzip
import json
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.domain.session import SessionUpdate
from tests.test_sessions import start
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture
from tests.test_sharing import create_group

client = client_fixture
connection = connection_fixture


def encoded(data):
    return gzip.compress(json.dumps(data, ensure_ascii=False).encode())


def patch(client, session, data, **headers):
    return client.patch(
        f"/api/sessions/{session['id']}",
        content=encoded(data),
        headers={"Content-Type": "application/json", "Content-Encoding": "gzip", **headers},
    )


def test_compressed_save_retry_share_and_owner_boundary(client):
    group = create_group(client)
    client.post(
        "/api/groups/join", json={"invite_code": group["invite_code"]}, headers={"X-Test-User": "B"}
    )
    session = start(client)
    data = {
        "expected_revision": session["revision"],
        "exercises": [{"name": "ベンチプレス", "sets": [{"weight": 82.5, "reps": 8}]}],
    }
    saved = patch(client, session, data)
    assert saved.status_code == 200, saved.text
    assert saved.json()["exercises"] == data["exercises"]
    assert saved.json()["revision"] == session["revision"] + 1
    assert patch(client, session, data).json() == saved.json()
    assert client.patch(f"/api/sessions/{session['id']}", json=data).json() == saved.json()
    assert patch(client, session, data, **{"X-Test-User": "B"}).status_code == 404
    records = client.get(f"/api/groups/{group['id']}/workouts", headers={"X-Test-User": "B"}).json()
    assert len(records) == 1
    assert records[0]["exercises"] == data["exercises"]
    data["exercises"][0]["sets"][0]["weight"] = 90
    assert patch(client, session, data).status_code == 409
    data["expected_revision"] = saved.json()["revision"]
    data["exercises"][0]["sets"][0]["weight"] = 82.5
    data["exercises"][0]["sets"].append({"weight": 90, "reps": 8})
    changed = patch(client, session, data)
    assert changed.json()["best_updated"] is True
    data = {"expected_revision": changed.json()["revision"], "exercises": []}
    assert patch(client, session, data).json()["exercises"] == []


def test_compressed_maximum_valid_session_and_validation(client):
    session = start(client)
    data = {
        "expected_revision": session["revision"],
        "exercises": [
            {"name": f"{index:02d}" + "筋" * 58, "sets": [{"weight": 1000, "reps": 1000}] * 30}
            for index in range(20)
        ],
    }
    saved = patch(client, session, data)
    assert saved.status_code == 200, saved.text
    assert saved.json()["exercises"] == data["exercises"]
    data["expected_revision"] = saved.json()["revision"]
    data["exercises"][0]["sets"].append({"weight": 80, "reps": 8})
    assert patch(client, session, data).status_code == 422
    assert client.get("/api/sessions/active").json() == saved.json()


def test_old_api_rejects_gzip_before_saving_with_400():
    legacy = FastAPI()
    calls = []

    @legacy.patch("/sessions/{session_id}")
    def save(session_id: str, data: SessionUpdate):
        calls.append(data)
        return {}

    data = {"expected_revision": 1, "exercises": []}
    with TestClient(legacy) as old:
        result = old.patch(
            f"/sessions/{uuid4()}",
            content=encoded(data),
            headers={"Content-Type": "application/json", "Content-Encoding": "gzip"},
        )
    assert result.status_code == 400
    assert calls == []


def test_invalid_gzip_never_changes_session(client):
    session = start(client)
    data = {"expected_revision": session["revision"], "exercises": []}
    body = encoded(data)
    invalid = [b"", b"plain", body[:-1], body + b"extra", body + body]
    broken_crc = bytearray(body)
    broken_crc[-8] ^= 1
    invalid.append(bytes(broken_crc))
    for content in invalid:
        response = client.patch(
            f"/api/sessions/{session['id']}",
            content=content,
            headers={"Content-Type": "application/json", "Content-Encoding": "gzip"},
        )
        assert response.status_code == 400, response.text
    # 受信量の上限は、大きなgzipファイル名だけでも検出する。
    oversized_header = body[:3] + b"\x08" + body[4:10] + b"a" * (128 * 1024) + b"\0" + body[10:]
    for content in [encoded({"value": "x" * (128 * 1024)}), oversized_header]:
        response = client.patch(
            f"/api/sessions/{session['id']}",
            content=content,
            headers={"Content-Type": "application/json", "Content-Encoding": "gzip"},
        )
        assert response.status_code == 413
    for encoding in ["br", "gzip, gzip", "deflate"]:
        response = client.patch(
            f"/api/sessions/{session['id']}",
            content=body,
            headers={"Content-Type": "application/json", "Content-Encoding": encoding},
        )
        assert response.status_code == 415
    assert client.get("/api/sessions/active").json() == session
