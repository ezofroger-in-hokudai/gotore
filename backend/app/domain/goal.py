from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

STANDARD_GOAL = "筋トレを継続し、自分に合ったトレーニングを積み重ねる"
STANDARD_CRITERIA = [
    {
        "text": "筋力トレーニングに当たる種目に取り組んでいる。自重・軽い負荷・新種目も認める。",
        "observation_days": 1,
    },
    {
        "text": (
            "種目とセットの配分が目標の指定に沿う。"
            "標準目標は配分の指定がないため、自由な配分を満たすと判定する。"
        ),
        "observation_days": 1,
    },
]
GoalText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class GoalCriterion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]
    observation_days: int = Field(ge=1, le=30, strict=True)


class GoalInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1, strict=True)
    body: GoalText
    is_standard: bool = Field(strict=True)
    criteria: list[GoalCriterion] = Field(min_length=2, max_length=4)

    @model_validator(mode="after")
    def validate_standard(self):
        if self.is_standard and (
            self.body != STANDARD_GOAL
            or [c.model_dump() for c in self.criteria] != STANDARD_CRITERIA
        ):
            raise ValueError("標準目標の条件は変更できません。個人目標として保存してください")
        if len({c.text for c in self.criteria}) != len(self.criteria):
            raise ValueError("評価条件が重複しています")
        return self
