from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from app.api.dependencies import training_service
from app.core.config import settings
from app.infrastructure.notifications import NotificationRepository
from app.schemas.notifications import NotificationSeen, NotificationSettings, PushSubscription
from app.services.training import TrainingService

router = APIRouter(prefix="/notifications", tags=["notifications"])
Service = Annotated[TrainingService, Depends(training_service)]


def repository(service):
    return NotificationRepository(service.repository.connection)


@router.get("/settings", response_model=NotificationSettings)
def get_settings(service: Service):
    return repository(service).settings(service.user.id)


@router.put("/settings", response_model=NotificationSettings)
def save_settings(body: NotificationSettings, service: Service):
    return repository(service).save_settings(service.user.id, body)


@router.get("/inbox")
def inbox(service: Service):
    return {
        "items": repository(service).inbox(service.user.id),
        "live_start_ids": repository(service).live_start_ids(service.user.id),
    }


@router.post("/seen", status_code=204)
def seen(body: NotificationSeen, service: Service):
    repository(service).seen(service.user.id, body.ids)
    return Response(status_code=204)


@router.get("/push-key")
def push_key(service: Service):
    return {"public_key": settings.vapid_public_key if settings.vapid_private_key else ""}


@router.put("/subscription")
def subscribe(body: PushSubscription, service: Service):
    return repository(service).subscribe(service.user.id, body)


class SubscriptionEndpoint(BaseModel):
    endpoint: str = Field(max_length=2048)


@router.delete("/subscription", status_code=204)
def unsubscribe(body: SubscriptionEndpoint, service: Service):
    repository(service).unsubscribe(service.user.id, body.endpoint)
    return Response(status_code=204)


class Presence(BaseModel):
    active: bool = True


@router.post("/presence/{subscription_id}", status_code=204)
def presence(subscription_id: UUID, body: Presence, service: Service):
    repository(service).presence(service.user.id, subscription_id, body.active)
    return Response(status_code=204)
