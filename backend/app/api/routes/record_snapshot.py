from fastapi import APIRouter, Depends
from psycopg.pq import TransactionStatus

from app.api.compressed_request import SnapshotGzipRoute
from app.api.dependencies import current_user, database
from app.infrastructure.exercise_catalog import ExerciseCatalogRepository
from app.infrastructure.record_snapshot import RecordSnapshotRepository
from app.infrastructure.training_repository import TrainingRepository
from app.schemas.record_snapshot import RecordChanges, RecordManifest, RecordSnapshot

router = APIRouter(tags=["training"])


@router.get("/me/record-snapshot", response_model=RecordSnapshot)
def record_snapshot(user=Depends(current_user), connection=Depends(database)):
    TrainingRepository(connection).profile(user)
    ExerciseCatalogRepository(connection).initialize(user.id)
    outermost = connection.info.transaction_status == TransactionStatus.IDLE
    with connection.transaction():
        if outermost:
            connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        return RecordSnapshotRepository(connection).read(user.id)


def record_snapshot_changes(
    manifest: RecordManifest, user=Depends(current_user), connection=Depends(database)
):
    TrainingRepository(connection).profile(user)
    ExerciseCatalogRepository(connection).initialize(user.id)
    outermost = connection.info.transaction_status == TransactionStatus.IDLE
    with connection.transaction():
        if outermost:
            connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        return RecordSnapshotRepository(connection).changes(user.id, manifest)


router.add_api_route(
    "/me/record-snapshot/changes",
    record_snapshot_changes,
    methods=["POST"],
    response_model=RecordChanges,
    route_class_override=SnapshotGzipRoute,
)
