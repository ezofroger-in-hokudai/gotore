import os

import pytest

from app.schemas.notifications import PushSubscription
from app.services.notification_keys import create_keys


def test_keys_are_valid_private_and_never_overwritten(tmp_path):
    path = tmp_path / ".env.vapid"
    create_keys(path)
    assert os.stat(path).st_mode & 0o777 == 0o600
    values = dict(line.split("=", 1) for line in path.read_text().splitlines())
    PushSubscription.model_validate(
        {
            "endpoint": "https://fcm.googleapis.com/example",
            "keys": {"p256dh": values["VAPID_PUBLIC_KEY"], "auth": "AAAAAAAAAAAAAAAAAAAAAA"},
        }
    )
    assert len(values["VAPID_PRIVATE_KEY"]) == 43
    original = path.read_bytes()
    with pytest.raises(FileExistsError):
        create_keys(path)
    assert path.read_bytes() == original


def test_generated_keys_encrypt_web_push_without_network(tmp_path):
    import base64

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from pywebpush import webpush
    from requests import Response

    path = tmp_path / ".env.vapid"
    create_keys(path)
    values = dict(line.split("=", 1) for line in path.read_text().splitlines())
    receiver = ec.generate_private_key(ec.SECP256R1())
    public = receiver.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    calls = []

    class OfflineSession:
        def post(self, endpoint, **kwargs):
            calls.append((endpoint, kwargs))
            response = Response()
            response.status_code = 201
            response._content = b""
            return response

    payload = '{"kind":"stamp","count":12}'
    response = webpush(
        subscription_info={
            "endpoint": "https://fcm.googleapis.com/example",
            "keys": {
                "p256dh": base64.urlsafe_b64encode(public).decode().rstrip("="),
                "auth": "AAAAAAAAAAAAAAAAAAAAAA",
            },
        },
        data=payload,
        vapid_private_key=values["VAPID_PRIVATE_KEY"],
        vapid_claims={"sub": "mailto:test@example.test"},
        requests_session=OfflineSession(),
        headers={"Topic": "egotore-stamp"},
        ttl=3600,
        timeout=5,
    )
    assert response.status_code == 201 and len(calls) == 1
    encrypted = calls[0][1]
    assert payload.encode() not in encrypted["data"]
    assert encrypted["headers"]["content-encoding"] == "aes128gcm"
    assert encrypted["headers"]["authorization"].startswith("vapid ")
    assert encrypted["headers"]["topic"] == "egotore-stamp"
