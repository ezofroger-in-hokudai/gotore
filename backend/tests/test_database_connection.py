from contextlib import contextmanager
from types import SimpleNamespace

import psycopg
import pytest
from fastapi import HTTPException
from psycopg_pool import PoolTimeout, TooManyRequests

from app.api.dependencies import database
from app.core.config import settings


def test_connection_disables_prepared_statements_for_transaction_pooler(monkeypatch):
    connection = object()
    monkeypatch.setattr(settings, "database_url", "postgresql://pooler.test/db?sslmode=require")

    @contextmanager
    def connect(url, **options):
        assert url == settings.database_url
        assert options["prepare_threshold"] is None
        assert options["autocommit"] is True
        assert options["connect_timeout"] == 5
        yield connection

    monkeypatch.setattr(psycopg, "connect", connect)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(database_pool=None)))
    assert list(database(request)) == [connection]


@pytest.mark.parametrize("error", [PoolTimeout, TooManyRequests])
def test_pool_exhaustion_returns_retryable_error_without_connection_details(monkeypatch, error):
    monkeypatch.setattr(settings, "database_url", "postgresql://pooler.test/db")

    @contextmanager
    def unavailable():
        raise error("internal pool details")
        yield

    pool = SimpleNamespace(connection=unavailable)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(database_pool=pool)))
    with pytest.raises(HTTPException) as raised:
        list(database(request))
    assert raised.value.status_code == 503
    assert "再試行" in raised.value.detail
    assert "internal" not in raised.value.detail


@pytest.mark.parametrize(
    ("phase", "error", "sqlstate"),
    [
        ("connect", PoolTimeout, "unknown"),
        ("connect", TooManyRequests, "unknown"),
        ("connect", psycopg.OperationalError, "unknown"),
        ("query", psycopg.errors.UndefinedColumn, "42703"),
        ("query", psycopg.errors.UndefinedTable, "42P01"),
        ("query", psycopg.errors.QueryCanceled, "57014"),
        ("release", psycopg.OperationalError, "unknown"),
    ],
)
def test_database_failure_logs_phase_and_code_without_private_details(
    monkeypatch, caplog, phase, error, sqlstate
):
    secret = "private-password-record-token"
    monkeypatch.setattr(settings, "database_url", f"postgresql://user:{secret}@pooler.test/db")

    @contextmanager
    def connect(*args, **kwargs):
        if phase == "connect":
            raise error(secret)
        yield object()
        if phase == "release":
            raise error(secret)

    monkeypatch.setattr(psycopg, "connect", connect)
    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(database_pool=None)),
        scope={
            "route": SimpleNamespace(path="/api/groups/{group_id}/workouts/{workout_id}"),
            "path": f"/api/groups/{secret}/workouts/{secret}",
            "query_string": secret.encode(),
            "headers": [(b"authorization", secret.encode())],
        },
    )
    dependency = database(request)
    with pytest.raises(HTTPException) as raised:
        if phase == "query":
            next(dependency)
            dependency.throw(error(secret))
        else:
            list(dependency)
    assert raised.value.status_code == 503
    assert raised.value.detail == "記録サービスを利用できません。再試行してください"
    logs = [r for r in caplog.records if r.name == "app.api.dependencies"]
    assert len(logs) == 1
    message = logs[0].getMessage()
    assert "database_failure" in message
    assert f"phase={phase}" in message
    assert f"error={error.__name__}" in message
    assert f"sqlstate={sqlstate}" in message
    assert "route=/api/groups/{group_id}/workouts/{workout_id}" in message
    assert secret not in caplog.text
    assert logs[0].exc_info is None
