from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import training_service
from app.domain.identity import User
from app.domain.workout import WorkoutInput
from app.schemas.activity import MonthlyActivity
from app.schemas.training import (
    GroupCreate,
    GroupDetail,
    GroupJoin,
    GroupRename,
    GroupResponse,
    WorkoutResponse,
)
from app.services.training import TrainingService

router = APIRouter(tags=["training"])
Service = Annotated[TrainingService, Depends(training_service)]
Limit = Annotated[int, Query(ge=1, le=50)]
Offset = Annotated[int, Query(ge=0)]


@router.get("/me", response_model=User)
def me(service: Service):
    return service.user


@router.post("/me/profile", response_model=User)
def sync_profile(service: Service):
    return service.user


@router.get("/groups", response_model=list[GroupResponse])
def groups(service: Service):
    return service.groups()


@router.post("/groups", response_model=GroupResponse, status_code=201)
def create_group(data: GroupCreate, service: Service):
    return service.create_group(data.name)


@router.post("/groups/join", response_model=GroupResponse)
def join_group(data: GroupJoin, service: Service):
    return service.join_group(data.invite_code)


@router.get("/groups/{group_id}", response_model=GroupDetail)
def group(group_id: UUID, service: Service):
    return service.group(group_id)


@router.patch("/groups/{group_id}", response_model=GroupResponse)
def rename_group(group_id: UUID, data: GroupRename, service: Service):
    return service.rename_group(group_id, data.name)


@router.get("/groups/{group_id}/workouts", response_model=list[WorkoutResponse])
def group_workouts(group_id: UUID, service: Service, limit: Limit = 50, offset: Offset = 0):
    return service.workouts(group_id, limit, offset)


@router.get("/workouts", response_model=list[WorkoutResponse])
def workouts(
    service: Service,
    limit: Limit = 50,
    offset: Offset = 0,
    performed_on: date | None = None,
):
    try:
        return service.workouts(None, limit, offset, performed_on)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


@router.get("/workouts/activity", response_model=MonthlyActivity)
def activity(month: str, service: Service):
    try:
        return service.activity(month)
    except ValueError:
        raise HTTPException(
            422, "月は2000年1月から当月までをYYYY-MM形式で指定してください"
        ) from None


@router.post("/workouts", response_model=WorkoutResponse, status_code=201)
def save_workout(data: WorkoutInput, service: Service):
    return service.save_workout(data)
