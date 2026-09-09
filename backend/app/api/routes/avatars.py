import base64
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import training_service
from app.domain.avatar import MAX_UPLOAD_BYTES
from app.infrastructure.avatar_image import normalize_avatar
from app.infrastructure.avatars import AvatarRepository
from app.services.training import TrainingService

router = APIRouter(tags=["profile"])
Service = Annotated[TrainingService, Depends(training_service)]


class AvatarResponse(BaseModel):
    version: UUID | None
    data_url: str | None


def response(row) -> AvatarResponse:
    return AvatarResponse(
        version=row["version"] if row else None,
        data_url="data:image/jpeg;base64," + base64.b64encode(row["image"]).decode()
        if row
        else None,
    )


@router.get("/me/avatar", response_model=AvatarResponse)
def own_avatar(service: Service):
    repository = AvatarRepository(service.repository.connection)
    return response(repository.get(service.user.id, service.user.id))


@router.get("/profiles/{user_id}/avatar", response_model=AvatarResponse)
def avatar(user_id: UUID, service: Service):
    row = AvatarRepository(service.repository.connection).get(service.user.id, user_id)
    if row is None:
        raise HTTPException(404, "画像を表示できません")
    return response(row)


@router.put(
    "/me/avatar",
    response_model=AvatarResponse,
    openapi_extra={
        "requestBody": {
            "required": True,
            "description": "JPEG・PNG・WebPの静止画。512KiB・400万画素以下。",
            "content": {
                kind: {"schema": {"type": "string", "format": "binary"}}
                for kind in ("image/jpeg", "image/png", "image/webp")
            },
        }
    },
)
async def save_avatar(request: Request, service: Service):
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "画像を小さくして再試行してください")
        content.extend(chunk)
    try:
        image = await run_in_threadpool(normalize_avatar, bytes(content))
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    repository = AvatarRepository(service.repository.connection)
    return response(await run_in_threadpool(repository.save, service.user.id, image))


@router.delete("/me/avatar", status_code=204)
def delete_avatar(service: Service):
    AvatarRepository(service.repository.connection).delete(service.user.id)
    return Response(status_code=204)
