from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import training_service
from app.domain import activity
from app.domain.analytics import Period, analytics_window
from app.domain.workout import Name
from app.infrastructure.analytics import AnalyticsRepository
from app.schemas.analytics import AnalyticsResponse, HistorySummary
from app.services.training import TrainingService

router = APIRouter(tags=["analytics"])
Service = Annotated[TrainingService, Depends(training_service)]
Offset = Annotated[int, Query(ge=0, le=10000)]


BodyPart = Literal["chest", "back", "legs", "arms", "shoulders", "abs", "glutes", "other"]


def read(
    service, period, offset, exercise, group_id=None, anchor=None, member_id=None, body_part=None
):
    try:
        window = analytics_window(period, offset, activity.today_in_japan(), anchor)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return AnalyticsRepository(service.repository).read(
        service.user.id, window, exercise, group_id, member_id, body_part
    )


@router.get("/analytics", response_model=AnalyticsResponse)
def personal_analytics(
    service: Service,
    period: Period = "month",
    offset: Offset = 0,
    exercise: Name | None = None,
    anchor: date | None = None,
    body_part: BodyPart | None = None,
):
    return read(service, period, offset, exercise, anchor=anchor, body_part=body_part)


@router.get("/history/summary", response_model=HistorySummary)
def personal_history_summary(service: Service):
    return AnalyticsRepository(service.repository).personal_summary(service.user.id)


@router.get("/groups/{group_id}/analytics", response_model=AnalyticsResponse)
def group_analytics(
    group_id: UUID,
    service: Service,
    period: Period = "month",
    offset: Offset = 0,
    exercise: Name | None = None,
    anchor: date | None = None,
    member_id: UUID | None = None,
    body_part: BodyPart | None = None,
):
    return read(service, period, offset, exercise, group_id, anchor, member_id, body_part)
