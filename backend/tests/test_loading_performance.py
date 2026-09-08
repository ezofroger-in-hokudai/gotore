from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from app.domain.identity import AuthenticatedUser
from app.infrastructure.training_repository import TrainingRepository
from app.main import app


def test_unchanged_profile_does_not_write_or_lock():
    user = AuthenticatedUser(id=uuid4(), display_name="本人")
    statements = []

    class Connection:
        def execute(self, sql, params):
            statements.append(sql)
            assert sql.lstrip().startswith("SELECT"), "通常の読み込みで書き込みロックを取らない"
            return self

        def fetchone(self):
            return {"id": user.id, "display_name": user.display_name}

    assert TrainingRepository(Connection()).profile(user).display_name == "本人"
    assert len(statements) == 1


def test_auth_connection_reuse_does_not_reuse_identity_or_cookies():
    from app.infrastructure.auth_client import AuthClient

    tokens = []

    def auth(request):
        assert "cookie" not in request.headers
        tokens.append(request.headers["authorization"])
        return httpx.Response(
            200, json={"id": str(uuid4())}, headers={"set-cookie": "session=private"}
        )

    with httpx.Client(transport=httpx.MockTransport(auth)) as transport:
        client = AuthClient(transport)
        for token in ["first-user", "second-user", "first-user"]:
            client.get(
                "https://auth.test/user", headers={"Authorization": f"Bearer {token}"}, timeout=5
            )
    assert tokens == ["Bearer first-user", "Bearer second-user", "Bearer first-user"]


def test_timing_header_contains_only_measurements():
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.headers["cache-control"] == "no-store"
    parts = response.headers["server-timing"].split(", ")
    assert len(parts) == 1
    name, duration = parts[0].split(";dur=")
    assert name == "app"
    assert float(duration) >= 0


def test_auth_pool_lives_for_application_and_closes_on_shutdown():
    with TestClient(app):
        client = app.state.auth_client.client
        assert not client.is_closed
        assert app.state.auth_client.client is client
    assert client.is_closed


def test_failed_auth_timing_does_not_leak_to_next_request(monkeypatch):
    from app.core.config import settings
    from app.infrastructure.auth_client import AuthClient

    monkeypatch.setattr(settings, "supabase_url", "https://auth.test")
    monkeypatch.setattr(settings, "supabase_anon_key", "private-key")
    monkeypatch.setattr(AuthClient, "get", lambda *args, **kwargs: httpx.Response(401))
    with TestClient(app) as client:
        failure = client.get("/api/me", headers={"Authorization": "Bearer private-token"})
        assert failure.status_code == 401
        timing = failure.headers["server-timing"]
        assert "auth;dur=" in timing
        assert "private" not in timing
        health = client.get("/api/health")
        assert "auth;dur=" not in health.headers["server-timing"]
