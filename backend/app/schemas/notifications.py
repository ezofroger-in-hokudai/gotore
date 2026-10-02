import base64
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class NotificationSettings(BaseModel):
    stamp_enabled: bool = True
    start_enabled: bool = True
    start_timing: Literal["home", "now", "set"] = "home"
    vibration: bool = True
    sound: bool = False
    push_stamp: bool = True
    push_start: bool = True


class NotificationSeen(BaseModel):
    ids: list[UUID] = Field(min_length=1, max_length=100)


class PushSubscription(BaseModel):
    endpoint: str = Field(max_length=2048)
    keys: dict[str, str]

    @field_validator("endpoint")
    @classmethod
    def safe_endpoint(cls, value):
        url = urlsplit(value)
        host = url.hostname or ""
        providers = (
            "fcm.googleapis.com",
            "updates.push.services.mozilla.com",
            "web.push.apple.com",
        )
        if (
            url.scheme != "https"
            or url.username
            or url.password
            or url.port not in (None, 443)
            or url.fragment
            or not any(host == p or host.endswith("." + p) for p in providers)
        ):
            raise ValueError("対応するPushサービスのHTTPS URLが必要です")
        return value

    @field_validator("keys")
    @classmethod
    def valid_keys(cls, value):
        for key, size in (("p256dh", 65), ("auth", 16)):
            try:
                raw = base64.b64decode(
                    value[key] + "=" * (-len(value[key]) % 4), altchars=b"-_", validate=True
                )
            except (KeyError, ValueError, TypeError):
                raise ValueError("購読の鍵が不正です") from None
            if len(raw) != size or (key == "p256dh" and raw[0] != 4):
                raise ValueError("購読の鍵が不正です")
        return {key: value[key] for key in ("p256dh", "auth")}
