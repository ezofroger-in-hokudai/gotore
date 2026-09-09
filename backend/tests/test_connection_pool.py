import os

import psycopg
import pytest

from app.infrastructure.database_pool import create_database_pool


@pytest.fixture
def pool():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("専用_test DBが必要です")
    assert psycopg.conninfo.conninfo_to_dict(url)["dbname"].endswith("_test")
    with create_database_pool(url, 1) as pool:
        yield pool


def test_reuses_connection_and_rolls_back_failed_transaction(pool):
    with pool.connection() as connection:
        pid = connection.info.backend_pid
        assert connection.autocommit
        assert connection.prepare_threshold is None
        with pytest.raises(psycopg.errors.DivisionByZero), connection.transaction():
            connection.execute("SET LOCAL application_name = 'first-request'")
            connection.execute("SELECT 1 / 0")
    with pool.connection() as connection:
        assert connection.info.backend_pid == pid
        assert (
            connection.execute("SHOW application_name").fetchone()["application_name"]
            != "first-request"
        )
        assert connection.execute("SELECT 1 AS value").fetchone()["value"] == 1


def test_closed_connection_is_replaced(pool):
    with pool.connection() as connection:
        pid = connection.info.backend_pid
        connection.close()
    with pool.connection() as connection:
        assert connection.info.backend_pid != pid
        assert connection.execute("SELECT 1 AS value").fetchone()["value"] == 1


def test_server_disconnection_is_detected_before_lending_connection(pool):
    with pool.connection() as connection:
        pid = connection.info.backend_pid
    with psycopg.connect(pool.conninfo, autocommit=True) as admin:
        admin.execute("SELECT pg_terminate_backend(%s)", (pid,))
    with pool.connection() as connection:
        assert connection.info.backend_pid != pid
        assert connection.execute("SELECT 1 AS value").fetchone()["value"] == 1


def test_pool_limits_wait_and_releases_connection(pool):
    from psycopg_pool import PoolTimeout

    with pool.connection():
        with pytest.raises(PoolTimeout), pool.connection(timeout=0.05):
            pytest.fail("同時接続の上限を超えました")
    with pool.connection() as connection:
        assert connection.execute("SELECT 1 AS value").fetchone()["value"] == 1
