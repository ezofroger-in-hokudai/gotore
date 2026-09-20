from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.dependencies import current_user, database
from app.domain.identity import AuthenticatedUser
from app.domain.suggestion import SuggestionInput, SuggestionLimitReached
from app.infrastructure.suggestions import SuggestionRepository

router = APIRouter(tags=["suggestions"])


class SuggestionReceipt(BaseModel):
    id: UUID
    created_at: datetime


@router.post("/suggestions", status_code=201, response_model=SuggestionReceipt)
def submit_suggestion(
    data: SuggestionInput,
    user: Annotated[AuthenticatedUser, Depends(current_user)],
    connection=Depends(database),
):
    try:
        return SuggestionRepository(connection).submit(user, data)
    except SuggestionLimitReached:
        raise HTTPException(429, "送信件数の上限です。時間をおいてお試しください") from None
