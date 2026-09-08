from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.api.dependencies import current_user, database
from app.core.timing import measure
from app.domain.exercise_catalog import ExerciseOptionInput
from app.infrastructure.exercise_catalog import ExerciseCatalogRepository
from app.infrastructure.training_repository import TrainingRepository
from app.schemas.exercise_catalog import ExerciseOptionResponse
from app.services.exercise_catalog import ExerciseCatalogService

router = APIRouter(tags=["exercise-catalog"])


def exercise_catalog(user=Depends(current_user), connection=Depends(database)):
    with measure("profile"):
        TrainingRepository(connection).profile(user)
    return ExerciseCatalogService(ExerciseCatalogRepository(connection), user.id)


Service = Annotated[ExerciseCatalogService, Depends(exercise_catalog)]


@router.get("/exercise-options", response_model=list[ExerciseOptionResponse])
def options(service: Service):
    return service.options()


@router.post("/exercise-options", response_model=ExerciseOptionResponse, status_code=201)
def add_option(data: ExerciseOptionInput, service: Service):
    return service.add(data.name)


@router.delete("/exercise-options/{option_id}", status_code=204)
def delete_option(option_id: UUID, service: Service):
    service.delete(option_id)
    return Response(status_code=204)
