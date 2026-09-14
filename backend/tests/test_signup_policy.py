import pytest
from psycopg.types.json import Jsonb

from tests.test_sharing import connection as connection_fixture

connection = connection_fixture


@pytest.mark.parametrize(
    ("metadata", "allowed"),
    [
        ({"provider": "google"}, True),
        ({"provider": "email"}, False),
        ({"provider": "github"}, False),
        ({}, False),
    ],
)
def test_only_google_can_self_register(connection, metadata, allowed):
    event = {"user": {"app_metadata": metadata, "user_metadata": {"provider": "google"}}}
    result = connection.execute(
        "SELECT public.gotore_before_user_created(%s) AS result", (Jsonb(event),)
    ).fetchone()["result"]
    assert (result == {}) is allowed
    if not allowed:
        assert result["error"]["http_code"] == 403


def test_signup_hook_is_only_callable_by_auth(connection):
    for role, allowed in [("anon", False), ("authenticated", False), ("supabase_auth_admin", True)]:
        result = connection.execute(
            "SELECT has_function_privilege(%s, "
            "'public.gotore_before_user_created(jsonb)', 'execute') AS allowed",
            (role,),
        ).fetchone()
        assert result["allowed"] is allowed
