from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


def create_database_pool(url: str, max_size: int) -> ConnectionPool:
    return ConnectionPool(
        url,
        kwargs={
            "autocommit": True,
            "row_factory": dict_row,
            "connect_timeout": 5,
            "prepare_threshold": None,
        },
        min_size=0,
        max_size=max_size,
        timeout=5,
        max_waiting=16,
        max_idle=30,
        max_lifetime=300,
        check=ConnectionPool.check_connection,
        name="gotore-db",
        open=False,
    )
