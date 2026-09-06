from contextlib import contextmanager

import psycopg

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
    assert list(database()) == [connection]
