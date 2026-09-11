from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import training_service
from app.domain import activity
from app.domain.analytics import Period, analytics_window
from app.domain.workout import Name
from app.infrastructure.analytics import AnalyticsRepository
from app.schemas.analytics import AnalyticsResponse
from app.services.training import TrainingService

router = APIRouter(tags=["analytics"])
Service = Annotated[TrainingService, Depends(training_service)]
Offset = Annotated[int, Query(ge=0, le=10000)]


def read(service, period, offset, exercise, group_id=None):
    try:
        window = analytics_window(period, offset, activity.today_in_japan())
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return AnalyticsRepository(service.repository).read(service.user.id, window, exercise, group_id)


@router.get("/analytics", response_model=AnalyticsResponse)
def personal_analytics(
    service: Service, period: Period = "month", offset: Offset = 0, exercise: Name | None = None
):
    return read(service, period, offset, exercise)


@router.get("/groups/{group_id}/analytics", response_model=AnalyticsResponse)
def group_analytics(
    group_id: UUID,
    service: Service,
    period: Period = "month",
    offset: Offset = 0,
    exercise: Name | None = None,
):
    return read(service, period, offset, exercise, group_id)
