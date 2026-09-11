from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.goal import GoalCriterion
from app.domain.score import ScoreWeights


class GoalResponse(BaseModel):
    id: UUID
    version: int
    body: str
    is_standard: bool
    criteria: list[GoalCriterion]
    created_at: datetime


class ScoreSummary(BaseModel):
    workout_id: UUID
    revision: int
    total: int | None
    components: dict[str, float | None]
    status: Literal["pending", "processing", "complete", "stale"]
    weights: ScoreWeights
    weights_version: int
    scored_at: datetime


class CriterionJudgment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rating: float | None
    reason: str = Field(min_length=1, max_length=200)


class ScoreDetail(ScoreSummary):
    goal: GoalResponse
    baseline: dict | None
    comment: str | None
    judgments: list[CriterionJudgment]
    formula_version: str
    model: str | None


class WeightsInput(ScoreWeights):
    expected_version: int = Field(ge=0, strict=True)
