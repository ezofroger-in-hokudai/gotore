from contextlib import contextmanager
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from app.api.dependencies import current_user, database, training_service
from app.domain.activity import today_in_japan
from app.domain.goal import STANDARD_CRITERIA, STANDARD_GOAL, GoalInput, GoalText
from app.domain.identity import AuthenticatedUser
from app.domain.score import ScoreWeights
from app.infrastructure.goals import GoalRepository
from app.infrastructure.scores import ScoreRepository
from app.schemas.score import GoalResponse, ScoreDetail, ScoreSummary, WeightsInput
from app.services.scoring import evaluate_score, propose_goal
from app.services.training import TrainingService

router = APIRouter(tags=["scores"])
Service = Annotated[TrainingService, Depends(training_service)]
User = Annotated[AuthenticatedUser, Depends(current_user)]


def score_connections(request: Request):
    return lambda: contextmanager(database)(request)


Connections = Annotated[object, Depends(score_connections)]


class GoalProposalInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: GoalText


class GoalResetInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1, strict=True)


@router.post("/me/goal/reset", response_model=GoalResponse)
def reset_goal(data: GoalResetInput, service: Service):
    values = GoalInput(
        expected_version=data.expected_version,
        body=STANDARD_GOAL,
        is_standard=True,
        criteria=STANDARD_CRITERIA,
    )
    return GoalRepository(service.repository.connection).save(service.user.id, values)


@router.post("/me/goal/proposal")
def goal_proposal(data: GoalProposalInput, user: User, connections: Connections):
    return propose_goal(connections, user, data.body)


@router.post("/workouts/{workout_id}/score/evaluate", response_model=ScoreDetail | None)
def evaluate(workout_id: UUID, user: User, connections: Connections):
    return evaluate_score(connections, user.id, workout_id)


@router.get("/me/goal", response_model=GoalResponse)
def current_goal(service: Service):
    return GoalRepository(service.repository.connection).current(service.user.id)


@router.put("/me/goal", response_model=GoalResponse)
def save_goal(data: GoalInput, service: Service):
    return GoalRepository(service.repository.connection).save(service.user.id, data)


@router.get("/workouts/{workout_id}/score", response_model=ScoreDetail | None)
def own_score(workout_id: UUID, service: Service):
    return ScoreRepository(service.repository.connection).get(service.user.id, workout_id)


@router.get("/groups/{group_id}/workouts/{workout_id}/score", response_model=ScoreSummary | None)
def shared_score(group_id: UUID, workout_id: UUID, service: Service):
    return ScoreRepository(service.repository.connection).get(service.user.id, workout_id, group_id)


@router.get("/groups/{group_id}/score-weights")
def group_weights(group_id: UUID, service: Service):
    return ScoreRepository(service.repository.connection).weights_settings(
        service.user.id, group_id, today_in_japan()
    )


@router.put("/groups/{group_id}/score-weights")
def save_group_weights(group_id: UUID, data: WeightsInput, service: Service):
    return ScoreRepository(service.repository.connection).save_weights(
        service.user.id,
        group_id,
        ScoreWeights(**data.model_dump(exclude={"expected_version"})),
        data.expected_version,
        today_in_japan(),
    )
