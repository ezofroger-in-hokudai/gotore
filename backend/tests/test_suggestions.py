from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.test_sharing import USERS
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture

client = client_fixture
connection = connection_fixture


def payload(content="設定に検索があるとうれしいです", id=None):
    return {"id": str(id or uuid4()), "content": content}


def test_requires_login():
    with TestClient(app) as api:
        assert api.post("/api/suggestions", json=payload()).status_code == 401


def test_create_and_retry_are_private_and_idempotent(client, connection):
    data = payload("  改善のお願い\nよろしくお願いします  ")
    first = client.post("/api/suggestions", json=data)
    assert first.status_code == 201, first.text
    assert set(first.json()) == {"id", "created_at"}
    assert first.headers["cache-control"] == "no-store"
    retry = client.post("/api/suggestions", json=data)
    assert retry.status_code == 201
    assert retry.json() == first.json()
    row = connection.execute("SELECT * FROM public.gotore_suggestions").fetchone()
    assert row["content"] == data["content"].strip()
    assert row["user_id"] == USERS["A"]
    assert (
        connection.execute("SELECT count(*) AS n FROM public.gotore_suggestions").fetchone()["n"]
        == 1
    )
    assert client.get("/api/suggestions").status_code == 405
    assert client.get(f"/api/suggestions/{data['id']}").status_code == 404
    assert client.patch("/api/suggestions", json=data).status_code == 405
    changed = client.post("/api/suggestions", json={**data, "content": "別の内容"})
    assert changed.status_code == 409
    other = client.post("/api/suggestions", json=data, headers={"X-Test-User": "B"})
    assert other.status_code == 201
    assert (
        connection.execute("SELECT count(*) AS n FROM public.gotore_suggestions").fetchone()["n"]
        == 2
    )


@pytest.mark.parametrize("content", ["", " \n\t　", "a" * 2001])
def test_invalid_content(client, content):
    assert client.post("/api/suggestions", json=payload(content)).status_code == 422


def test_limit_and_forged_identity(client, connection):
    assert (
        client.post("/api/suggestions", json={**payload(), "user_id": str(USERS["B"])}).status_code
        == 422
    )
    assert client.post("/api/suggestions", json=payload("😀" * 2000)).status_code == 201
    first = payload()
    assert client.post("/api/suggestions", json=first).status_code == 201
    for _ in range(18):
        assert client.post("/api/suggestions", json=payload()).status_code == 201
    assert client.post("/api/suggestions", json=payload()).status_code == 429
    assert client.post("/api/suggestions", json=first).status_code == 201
    connection.execute(
        "UPDATE public.gotore_suggestions SET created_at = now() - interval '25 hours'"
    )
    assert client.post("/api/suggestions", json=payload()).status_code == 201


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_browser_roles_cannot_access_posts(client, connection, role):
    assert client.post("/api/suggestions", json=payload()).status_code == 201
    for query in [
        "SELECT * FROM public.gotore_suggestions",
        "DELETE FROM public.gotore_suggestions",
        "UPDATE public.gotore_suggestions SET content = 'changed'",
        "INSERT INTO public.gotore_suggestions (id, user_id, content) "
        "VALUES (gen_random_uuid(), gen_random_uuid(), 'x')",
    ]:
        with pytest.raises(psycopg.errors.InsufficientPrivilege), connection.transaction():
            connection.execute(f"SET LOCAL ROLE {role}")
            connection.execute(query)
