import logging
from contextlib import ExitStack
from typing import Annotated
from uuid import UUID

import httpx
import psycopg
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg.rows import dict_row

from app.core.config import is_header_token, settings
from app.core.timing import measure
from app.domain.identity import AuthenticatedUser
from app.infrastructure.auth_client import AuthClient
from app.infrastructure.training_repository import TrainingRepository
from app.services.training import TrainingService

bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


def auth_client(request: Request) -> AuthClient:
    return request.app.state.auth_client


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    client: Annotated[AuthClient, Depends(auth_client)],
) -> AuthenticatedUser:
    if credentials is None:
        raise HTTPException(401, "ログインしてください", headers={"WWW-Authenticate": "Bearer"})
    if not is_header_token(credentials.credentials):
        raise HTTPException(401, "ログインし直してください")
    if invalid_field := settings.auth_configuration_error():
        logger.error("認証設定が不正です: %s を確認してください", invalid_field)
        raise HTTPException(503, "ログイン設定を管理者へ確認してください")
    try:
        with measure("auth"):
            response = client.get(
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
        return AuthenticatedUser(id=UUID(data["id"]), display_name=name or None)
    except (ValueError, KeyError, TypeError, AttributeError):
        raise HTTPException(401, "ユーザー情報を確認できません") from None


def database():
    if not settings.database_url:
        raise HTTPException(503, "データベースが設定されていません")
    try:
        with ExitStack() as stack:
            with measure("db_connect"):
                connection = stack.enter_context(
                    psycopg.connect(
                        settings.database_url,
                        autocommit=True,
                        row_factory=dict_row,
                        connect_timeout=5,
                        # Transaction Poolerでは接続をまたぐprepared statementを使用しない。
                        prepare_threshold=None,
                    )
                )
            yield connection
    except psycopg.Error:
        raise HTTPException(503, "記録サービスを利用できません。再試行してください") from None


def training_service(
    user: Annotated[AuthenticatedUser, Depends(current_user)], connection=Depends(database)
) -> TrainingService:
    with measure("profile"):
        return TrainingService(TrainingRepository(connection), user)
