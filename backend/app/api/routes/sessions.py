from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.compressed_request import GzipRoute
from app.api.dependencies import training_service
from app.domain.session import ExerciseMemoInput, SessionRevision, SessionStart, SessionUpdate
from app.domain.workout import Name
from app.infrastructure.sessions import SessionRepository
from app.schemas.session import (
    ExerciseContext,
    GroupActivity,
    GroupSummary,
    InvitePreview,
    SessionBests,
    SessionResponse,
)
from app.schemas.training import GroupJoin, WorkoutMemoResponse
from app.services.training import TrainingService

router = APIRouter(tags=["sessions"])
Service = Annotated[TrainingService, Depends(training_service)]


def repository(service: TrainingService):
    return SessionRepository(service.repository.connection)


@router.get("/sessions/active", response_model=SessionResponse | None)
def active_session(service: Service):
    repo = repository(service)
    return repo.with_shares(repo.active(service.user.id))


@router.post("/sessions", response_model=SessionResponse, status_code=201)
def start_session(data: SessionStart, service: Service):
    return repository(service).start(service.user.id, data.id)


@router.get("/sessions/{session_id}/bests", response_model=SessionBests)
def session_bests(session_id: UUID, service: Service):
    return repository(service).overview_bests(service.user.id, session_id)


def save_session(session_id: UUID, data: SessionUpdate, service: Service):
    return repository(service).save_session(service.user.id, session_id, data)


router.add_api_route(
    "/sessions/{session_id}",
    save_session,
    methods=["PATCH"],
    response_model=SessionResponse,
    route_class_override=GzipRoute,
    description="通常のJSONまたはContent-Encoding: gzip。圧縮時は本文・展開後とも128KiBまで。",
    responses={
        400: {"description": "圧縮本文が不正"},
        413: {"description": "圧縮本文または展開結果が過大"},
        415: {"description": "未対応のContent-Encoding"},
    },
)


@router.post("/sessions/{session_id}/finish", response_model=SessionResponse)
def finish_session(session_id: UUID, data: SessionRevision, service: Service):
    return repository(service).finish(service.user.id, session_id, data.expected_revision)


@router.post("/sessions/{session_id}/heartbeat", status_code=204)
def heartbeat(session_id: UUID, service: Service):
    repository(service).heartbeat(service.user.id, session_id)


@router.post("/groups/preview", response_model=InvitePreview)
def preview_group(data: GroupJoin, service: Service):
    return repository(service).preview(service.user.id, data.invite_code)


@router.get("/groups/activity/summary", response_model=list[GroupSummary])
def group_summaries(service: Service):
    return repository(service).group_summaries(service.user.id)


@router.get("/groups/{group_id}/activity", response_model=GroupActivity)
def group_activity(group_id: UUID, service: Service):
    return repository(service).group_activity(service.user.id, group_id)


@router.get("/exercises/context", response_model=ExerciseContext)
def exercise_context(name: Name, service: Service, session_id: UUID | None = None):
    return repository(service).context(service.user.id, name, session_id)


@router.put("/exercises/memo", response_model=WorkoutMemoResponse)
def exercise_memo(data: ExerciseMemoInput, service: Service):
    return repository(service).save_exercise_memo(service.user.id, data)
