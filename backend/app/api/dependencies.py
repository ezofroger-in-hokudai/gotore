from typing import Annotated
from uuid import UUID

import httpx
import psycopg
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg.rows import dict_row

from app.core.config import settings
from app.domain.identity import User
from app.infrastructure.training_repository import TrainingRepository
from app.services.training import TrainingService

bearer = HTTPBearer(auto_error=False)


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    if credentials is None:
        raise HTTPException(401, "ログインしてください", headers={"WWW-Authenticate": "Bearer"})
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(503, "認証サービスが設定されていません")
    try:
        response = httpx.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": settings.supabase_anon_key,
                "Authorization": f"Bearer {credentials.credentials}",
            },
            timeout=5,
        )
    except httpx.HTTPError:
        raise HTTPException(503, "認証サービスに接続できません") from None
    if response.status_code in (401, 403):
        raise HTTPException(401, "ログインし直してください")
    if response.status_code != 200:
        raise HTTPException(503, "認証サービスを利用できません")
    try:
        data = response.json()
        metadata = data.get("user_metadata") or {}
        name = metadata.get("display_name")
        name = name.strip()[:20] if isinstance(name, str) else ""
        return User(id=UUID(data["id"]), display_name=name or "トレーニー")
    except (ValueError, KeyError, TypeError, AttributeError):
        raise HTTPException(401, "ユーザー情報を確認できません") from None


def database():
    if not settings.database_url:
        raise HTTPException(503, "データベースが設定されていません")
    try:
        with psycopg.connect(
            settings.database_url,
            autocommit=True,
            row_factory=dict_row,
            connect_timeout=5,
            # Transaction Poolerでは接続をまたぐprepared statementを使用しない。
            prepare_threshold=None,
        ) as connection:
            yield connection
    except psycopg.Error:
        raise HTTPException(
            503, "記録サービスを利用できません。時間をおいて再試行してください"
        ) from None


def training_service(
    user: Annotated[User, Depends(current_user)], connection=Depends(database)
) -> TrainingService:
    return TrainingService(TrainingRepository(connection), user)
