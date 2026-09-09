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
