from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.api.dependencies import training_service
from app.infrastructure.stamps import StampRepository
from app.schemas.stamps import StampBatch, StampKind, StampList, StampSeen, StampSummary
from app.services.training import TrainingService

router = APIRouter(tags=["stamps"])
Service = Annotated[TrainingService, Depends(training_service)]
Offset = Annotated[int, Query(ge=0, le=100000)]


@router.get("/groups/{group_id}/workouts/{workout_id}/stamps", response_model=StampList)
def stamps(group_id: UUID, workout_id: UUID, service: Service, offset: Offset = 0):
    return StampRepository(service.repository).listing(
        service.user.id, group_id, workout_id, offset
    )


@router.put("/groups/{group_id}/workouts/{workout_id}/stamps/{kind}")
def send(group_id: UUID, workout_id: UUID, kind: StampKind, service: Service):
    return StampRepository(service.repository).change(service.user.id, group_id, workout_id, kind)


@router.delete("/groups/{group_id}/workouts/{workout_id}/stamps/{kind}", status_code=204)
def remove(group_id: UUID, workout_id: UUID, kind: StampKind, service: Service):
    StampRepository(service.repository).change(service.user.id, group_id, workout_id, kind, True)
    return Response(status_code=204)


@router.get("/stamps/inbox", response_model=StampList)
def inbox(
    service: Service,
    group_id: UUID | None = None,
    workout_id: UUID | None = None,
    offset: Offset = 0,
):
    return StampRepository(service.repository).listing(
        service.user.id, group_id, workout_id, offset, inbox=True
    )


@router.post("/stamps/seen", status_code=204)
def seen(body: StampSeen, service: Service):
    StampRepository(service.repository).seen(service.user.id, body.ids, body.read)
    return Response(status_code=204)


@router.post("/groups/{group_id}/stamps/summary", response_model=dict[UUID, StampSummary])
def summaries(group_id: UUID, body: StampBatch, service: Service):
    return StampRepository(service.repository).summaries(
        service.user.id, group_id, body.workout_ids
    )
