from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def test_training_api_requires_login():
    with TestClient(app) as client:
        for path in ["/api/me", "/api/groups", "/api/workouts"]:
            response = client.get(path)
            assert response.status_code == 401
            assert response.headers["cache-control"] == "no-store"


def test_rejects_invalid_token_without_using_client_supplied_identity(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "http://auth.test")
    monkeypatch.setattr(settings, "supabase_anon_key", "test-key")
    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: httpx.Response(401))
    with TestClient(app) as client:
        assert client.get("/api/me", headers={"Authorization": "Bearer forged"}).status_code == 401


def test_identity_comes_from_auth_server_and_does_not_expose_email(monkeypatch):
    user_id = str(uuid4())
    monkeypatch.setattr(settings, "supabase_url", "http://auth.test")
    monkeypatch.setattr(settings, "supabase_anon_key", "test-key")

    def verified(url, *, headers, timeout):
        assert url == "http://auth.test/auth/v1/user"
        assert headers["Authorization"] == "Bearer verified"
        return httpx.Response(
            200,
            json={
                "id": user_id,
                "email": "private@example.test",
                "user_metadata": {"display_name": " 本人 "},
            },
        )

    monkeypatch.setattr(httpx, "get", verified)
    with TestClient(app) as client:
        result = client.get("/api/me", headers={"Authorization": "Bearer verified"})
        assert result.json() == {"id": user_id, "display_name": "本人"}


def test_auth_service_failure_does_not_grant_access(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "http://auth.test")
    monkeypatch.setattr(settings, "supabase_anon_key", "test-key")

    def unavailable(*args, **kwargs):
        raise httpx.ConnectError("unavailable")

    monkeypatch.setattr(httpx, "get", unavailable)
    with TestClient(app) as client:
        assert client.get("/api/me", headers={"Authorization": "Bearer token"}).status_code == 503
