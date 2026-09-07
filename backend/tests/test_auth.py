from uuid import uuid4

import httpx
import pytest
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from app.api.dependencies import current_user
from app.core.config import settings
from app.main import app


def test_training_api_requires_login():
    with TestClient(app) as client:
        for path in ["/api/me", "/api/groups", "/api/workouts", "/api/exercise-options"]:
            response = client.get(path)
            assert response.status_code == 401
            assert response.headers["cache-control"] == "no-store"
        assert client.patch(f"/api/groups/{uuid4()}", json={"name": "拒否"}).status_code == 401
        assert client.post("/api/me/profile").status_code == 401
        assert client.post("/api/exercise-options", json={"name": "拒否"}).status_code == 401
        assert client.delete(f"/api/exercise-options/{uuid4()}").status_code == 401


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
    result = current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials="verified"))
    assert result.model_dump(mode="json") == {"id": user_id, "display_name": "本人"}


def test_auth_service_failure_does_not_grant_access(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "http://auth.test")
    monkeypatch.setattr(settings, "supabase_anon_key", "test-key")

    def unavailable(*args, **kwargs):
        raise httpx.ConnectError("unavailable")

    monkeypatch.setattr(httpx, "get", unavailable)
    with TestClient(app) as client:
        assert client.get("/api/me", headers={"Authorization": "Bearer token"}).status_code == 503


def test_profile_read_requires_database_and_returns_safe_error(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "http://auth.test")
    monkeypatch.setattr(settings, "supabase_anon_key", "test-key")
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(
        httpx,
        "get",
        lambda *args, **kwargs: httpx.Response(
            200, json={"id": str(uuid4()), "user_metadata": {"display_name": "本人"}}
        ),
    )
    with TestClient(app) as client:
        response = client.get("/api/me", headers={"Authorization": "Bearer token"})
        assert response.status_code == 503
        assert response.headers["cache-control"] == "no-store"
        assert "display_name" not in response.json()


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("supabase_anon_key", ""),
        ("supabase_anon_key", "秘密の設定値"),
        ("supabase_anon_key", "private-key\n"),
        ("supabase_anon_key", " private-key"),
        ("supabase_anon_key", '"private-key"'),
        ("supabase_url", ""),
        ("supabase_url", "secret-invalid-url"),
        ("supabase_url", "ftp://secret.test"),
        ("supabase_url", "https://秘密.test"),
        ("supabase_url", "https://secret.test\n"),
        ("supabase_url", "https://secret.test:invalid"),
        ("supabase_url", "https://user:password@secret.test"),
        ("supabase_url", "https://secret.test?key=secret"),
        ("supabase_url", "https://secret.test#secret"),
    ],
)
def test_invalid_auth_configuration_returns_safe_503(monkeypatch, caplog, field, value):
    monkeypatch.setattr(settings, "supabase_url", "http://auth.test")
    monkeypatch.setattr(settings, "supabase_anon_key", "private-valid-key")
    monkeypatch.setattr(settings, field, value)

    def must_not_connect(*args, **kwargs):
        pytest.fail("不正な設定で認証サーバーへ接続してはいけない")

    monkeypatch.setattr(httpx, "get", must_not_connect)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/me", headers={"Authorization": "Bearer private-token"})
        assert response.status_code == 503
        assert response.headers["cache-control"] == "no-store"
        assert client.get("/api/health").status_code == 200
    assert field.upper() in caplog.text
    for secret in [value, "private-valid-key", "private-token"]:
        if secret:
            assert secret not in response.text
            assert secret not in caplog.text


@pytest.mark.parametrize("token", ["private token", "private\ttoken", "private\x7ftoken"])
def test_malformed_token_returns_401_without_auth_request(monkeypatch, token):
    monkeypatch.setattr(settings, "supabase_url", "http://auth.test")
    monkeypatch.setattr(settings, "supabase_anon_key", "test-key")

    def must_not_connect(*args, **kwargs):
        pytest.fail("不正なヘッダー値を転送してはいけない")

    monkeypatch.setattr(httpx, "get", must_not_connect)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401


@pytest.mark.parametrize("key", ["sb_publishable_test123", "eyJhbGciOiJIUzI1NiJ9.test.signature"])
def test_supported_public_key_formats_are_passed_unchanged(monkeypatch, key):
    monkeypatch.setattr(settings, "supabase_url", "http://auth.test/")
    monkeypatch.setattr(settings, "supabase_anon_key", key)

    def verify(url, *, headers, timeout):
        assert url == "http://auth.test/auth/v1/user"
        assert headers["apikey"] == key
        return httpx.Response(200, json={"id": str(uuid4())})

    monkeypatch.setattr(httpx, "get", verify)
    result = current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials="token"))
    assert result.display_name is None
