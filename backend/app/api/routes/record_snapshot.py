from fastapi import APIRouter, Depends
from psycopg.pq import TransactionStatus

from app.api.dependencies import current_user, database
from app.infrastructure.exercise_catalog import ExerciseCatalogRepository
from app.infrastructure.record_snapshot import RecordSnapshotRepository
from app.infrastructure.training_repository import TrainingRepository
from app.schemas.record_snapshot import RecordSnapshot

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
