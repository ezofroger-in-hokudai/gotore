import base64
from datetime import datetime
from io import BytesIO
from uuid import UUID

import pytest

from app.domain.avatar import MAX_UPLOAD_BYTES
from tests.test_sharing import USERS, create_group
from tests.test_sharing import client as client_fixture
from tests.test_sharing import connection as connection_fixture

client = client_fixture
connection = connection_fixture


def picture(color="red", size=(300, 200), format="PNG"):
    from PIL import Image

    output = BytesIO()
    Image.new("RGB", size, color).save(output, format=format)
    return output.getvalue()


def upload(client, content, user="A"):
    return client.put(
        "/api/me/avatar",
        content=content,
        headers={"Content-Type": "application/octet-stream", "X-Test-User": user},
    )


def test_avatar_is_normalized_private_and_removed(client):
    from PIL import Image

    path = f"/api/profiles/{USERS['A']}/avatar"
    assert client.get("/api/me/avatar").json() == {"version": None, "data_url": None}
    result = upload(client, picture())
    assert result.status_code == 200, result.text
    first = result.json()
    UUID(first["version"])
    assert first["data_url"].startswith("data:image/jpeg;base64,")
    image = Image.open(BytesIO(base64.b64decode(first["data_url"].split(",")[1])))
    assert image.size == (256, 256)
    assert not image.getexif()
    assert client.get("/api/me/avatar").json() == first
    assert client.get(path).headers["cache-control"] == "no-store"
    assert client.get(path, headers={"X-Test-User": "B"}).status_code == 404
    group = create_group(client)
    client.post(
        "/api/groups/join", json={"invite_code": group["invite_code"]}, headers={"X-Test-User": "B"}
    )
    assert client.get(path, headers={"X-Test-User": "B"}).json() == first
    members = client.get(f"/api/groups/{group['id']}/activity").json()["members"]
    member = next(m for m in members if m["id"] == str(USERS["A"]))
    assert member["avatar_version"] == first["version"]
    assert client.put(path, content=picture(), headers={"X-Test-User": "B"}).status_code == 405
    second = upload(client, picture("blue")).json()
    assert second["version"] != first["version"]
    assert client.get("/api/me/avatar", headers={"X-Test-User": "B"}).json()["version"] is None
    members = client.get(f"/api/groups/{group['id']}").json()["members"]
    joined_at = next(m["joined_at"] for m in members if m["id"] == str(USERS["B"]))
    client.delete(
        f"/api/groups/{group['id']}/membership",
        params={"expected_joined_at": joined_at},
        headers={"X-Test-User": "B"},
    )
    assert client.get(path, headers={"X-Test-User": "B"}).status_code == 404
    assert client.delete("/api/me/avatar").status_code == 204
    assert client.delete("/api/me/avatar").status_code == 204
    assert client.get("/api/me/avatar").json()["data_url"] is None
    assert client.get(path).status_code == 404


@pytest.mark.parametrize("content", [b"", b'<svg onload="alert(1)"/>', b"GIF89a", b"not an image"])
def test_invalid_image_preserves_saved_avatar(client, content):
    first = upload(client, picture()).json()
    assert upload(client, content).status_code == 422
    assert client.get("/api/me/avatar").json() == first


def test_reject_oversized_upload_and_pixels(client):
    assert upload(client, b"x" * (MAX_UPLOAD_BYTES + 1)).status_code == 413
    assert upload(client, picture(size=(2100, 2100))).status_code == 422


@pytest.mark.parametrize("format", ["JPEG", "PNG", "WEBP"])
def test_accept_raster_formats(client, format):
    assert upload(client, picture(format=format)).status_code == 200


def test_metadata_is_removed_and_other_user_changes_are_isolated(client):
    from PIL import Image

    output = BytesIO()
    image = Image.new("RGB", (256, 256), "red")
    exif = Image.Exif()
    exif[315] = "private metadata"
    exif[274] = 6
    image.save(output, format="JPEG", exif=exif)
    original = upload(client, output.getvalue()).json()
    normalized = base64.b64decode(original["data_url"].split(",")[1])
    assert b"private metadata" not in normalized
    assert not Image.open(BytesIO(normalized)).getexif()
    assert upload(client, picture("blue"), user="B").status_code == 200
    client.delete("/api/me/avatar", headers={"X-Test-User": "B"})
    assert client.get("/api/me/avatar").json() == original


def test_animated_image_is_rejected(client):
    from PIL import Image

    output = BytesIO()
    Image.new("RGB", (20, 20), "red").save(
        output,
        format="PNG",
        save_all=True,
        append_images=[Image.new("RGB", (20, 20), "blue")],
        duration=100,
        loop=0,
    )
    assert upload(client, output.getvalue()).status_code == 422


def test_live_has_server_time_and_expiry(client, connection):
    from tests.test_sessions import start

    group = create_group(client)
    session = start(client)
    data = client.get(f"/api/groups/{group['id']}/activity").json()
    assert datetime.fromisoformat(data["members"][0]["live_until"]) > datetime.fromisoformat(
        data["observed_at"]
    )
    connection.execute(
        """UPDATE public.gotore_workouts SET last_seen_at = now() - interval '6 minutes'
        WHERE id = %s""",
        (session["id"],),
    )
    data = client.get(f"/api/groups/{group['id']}/activity").json()
    assert data["members"][0]["live"] is False
    assert datetime.fromisoformat(data["members"][0]["live_until"]) < datetime.fromisoformat(
        data["observed_at"]
    )
