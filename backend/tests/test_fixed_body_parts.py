from pathlib import Path

import pytest

from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture

client = client_fixture
connection = connection_fixture


def test_legacy_inputs_normalize_and_explicit_duplicates_are_rejected(client):
    for i, primary in enumerate([None, "full_body", "other"]):
        result = client.post(
            "/api/exercise-options", json={"name": f"旧分類{i}", "primary_body_part": primary}
        )
        assert result.status_code == 201, result.text
        assert result.json()["primary_body_part"] == "other"
    result = client.post(
        "/api/exercise-options",
        json={
            "name": "補助の合流",
            "primary_body_part": "full_body",
            "secondary_body_parts": ["arms", "other"],
        },
    )
    assert result.status_code == 201, result.text
    assert result.json()["secondary_body_parts"] == ["arms"]
    assert (
        client.post("/api/exercise-options", json={"name": "指定なし"}).json()["primary_body_part"]
        == "other"
    )
    combined = client.post(
        "/api/exercise-options",
        json={
            "name": "補助だけ全身",
            "primary_body_part": "chest",
            "secondary_body_parts": ["full_body", "other", "arms"],
        },
    )
    assert combined.status_code == 201
    assert combined.json()["secondary_body_parts"] == ["arms", "other"]
    for secondary in [["other"], ["arms", "arms"], ["full_body", "full_body"]]:
        assert (
            client.post(
                "/api/exercise-options",
                json={
                    "name": "不正",
                    "primary_body_part": "other",
                    "secondary_body_parts": secondary,
                },
            ).status_code
            == 422
        )


def test_migration_preserves_identity_records_and_revision_conflicts(client, connection):
    from tests.test_workout import payload

    options = client.get("/api/exercise-options").json()
    a, b, c = options[:3]
    record = client.post("/api/workouts", json=payload()).json()
    # 専用テストDBのロールバック対象内で、旧分類の制約に戻す。
    connection.execute("""ALTER TABLE public.gotore_exercise_options
        DROP CONSTRAINT gotore_exercise_primary_part,
        DROP CONSTRAINT gotore_exercise_secondary_parts,
        ALTER COLUMN primary_body_part DROP NOT NULL,
        ADD CONSTRAINT gotore_exercise_primary_part CHECK (true),
        ADD CONSTRAINT gotore_exercise_secondary_parts CHECK (true)""")
    connection.execute(
        "UPDATE public.gotore_exercise_options "
        "SET primary_body_part = NULL, secondary_body_parts = '{}' WHERE id = %s",
        (a["id"],),
    )
    connection.execute(
        "UPDATE public.gotore_exercise_options SET primary_body_part = 'full_body', "
        "secondary_body_parts = ARRAY['other','arms'] WHERE id = %s",
        (b["id"],),
    )
    connection.execute(
        "UPDATE public.gotore_exercise_options SET primary_body_part = 'chest', "
        "secondary_body_parts = ARRAY['full_body','other','arms'] WHERE id = %s",
        (c["id"],),
    )
    before = connection.execute(
        "SELECT id, user_id, name, created_at FROM public.gotore_exercise_options ORDER BY id"
    ).fetchall()
    migration = (
        Path(__file__).parents[2] / "supabase/migrations/20260913080000_fixed_body_parts.sql"
    )
    connection.execute(migration.read_text())
    assert (
        connection.execute(
            "SELECT id, user_id, name, created_at FROM public.gotore_exercise_options ORDER BY id"
        ).fetchall()
        == before
    )
    after = {x["id"]: x for x in client.get("/api/exercise-options").json()}
    assert after[a["id"]]["primary_body_part"] == "other"
    assert after[b["id"]]["primary_body_part"] == "other"
    assert after[b["id"]]["secondary_body_parts"] == ["arms"]
    assert after[c["id"]]["secondary_body_parts"] == ["arms", "other"]
    for item in [a, b, c]:
        assert after[item["id"]]["revision"] == item["revision"] + 1
    assert client.get("/api/workouts").json()[0] == record
    stale = client.patch(
        f"/api/exercise-options/{a['id']}",
        json={
            "expected_revision": a["revision"],
            "primary_body_part": "legs",
            "secondary_body_parts": [],
        },
    )
    assert stale.status_code == 409
    connection.execute(migration.read_text())
    assert client.get("/api/exercise-options").json() == list(after.values())


@pytest.mark.parametrize(
    "primary,secondary", [(None, []), ("full_body", []), ("chest", ["full_body"])]
)
def test_database_allows_only_eight_codes(client, connection, primary, secondary):
    import psycopg

    item = client.get("/api/exercise-options").json()[0]
    with pytest.raises(psycopg.IntegrityError), connection.transaction():
        connection.execute(
            "UPDATE public.gotore_exercise_options "
            "SET primary_body_part = %s, secondary_body_parts = %s WHERE id = %s",
            (primary, secondary, item["id"]),
        )


def test_other_bucket_merges_legacy_and_deleted_names_without_double_counting(client, connection):
    from tests.test_body_part_activity import activity, option, save

    a = option(client, "全身だった種目", "other")
    b = option(client, "未設定だった種目", "other")
    connection.execute("""ALTER TABLE public.gotore_exercise_options
        DROP CONSTRAINT gotore_exercise_primary_part,
        ALTER COLUMN primary_body_part DROP NOT NULL""")
    connection.execute(
        "UPDATE public.gotore_exercise_options SET primary_body_part = 'full_body' WHERE id = %s",
        (a["id"],),
    )
    connection.execute(
        "UPDATE public.gotore_exercise_options SET primary_body_part = NULL WHERE id = %s",
        (b["id"],),
    )
    save(client, "全身だった種目", "未設定だった種目", "削除済みの種目")
    save(client, "全身だった種目")
    data = activity(client)
    assert data["workout_count"] == 2
    assert data["days"][0]["body_parts"] == [
        {"body_part": "other", "volume": 800, "set_count": 4, "workout_count": 2}
    ]
    listed = client.get("/api/exercise-options").json()
    assert all(x["primary_body_part"] == "other" for x in listed if x["id"] in [a["id"], b["id"]])
