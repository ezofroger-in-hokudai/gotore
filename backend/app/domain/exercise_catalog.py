from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.workout import Name

DEFAULT_EXERCISES = (
    "ベンチプレス",
    "スクワット",
    "デッドリフト",
    "ペックフライ",
    "ラットプルダウン",
    "ショルダープレス",
    "懸垂",
    "腕立て伏せ",
)


BodyPart = Literal[
    "chest", "back", "shoulders", "arms", "legs", "glutes", "abs", "full_body", "other"
]
BODY_PARTS = ("chest", "back", "shoulders", "arms", "legs", "glutes", "abs", "full_body", "other")
DEFAULT_BODY_PARTS = {
    "ベンチプレス": ("chest", ["shoulders", "arms"]),
    "スクワット": ("legs", ["glutes"]),
    "デッドリフト": ("glutes", ["back", "legs"]),
    "ペックフライ": ("chest", ["shoulders"]),
    "ラットプルダウン": ("back", ["arms"]),
    "ショルダープレス": ("shoulders", ["arms"]),
    "懸垂": ("back", ["arms"]),
    "腕立て伏せ": ("chest", ["shoulders", "arms"]),
}


class BodyPartSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    primary_body_part: BodyPart | None = None
    secondary_body_parts: list[BodyPart] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def valid_parts(self):
        secondary = self.secondary_body_parts
        if secondary and self.primary_body_part is None:
            raise ValueError("補助部位を指定するには主な部位を選んでください")
        if len(set(secondary)) != len(secondary) or self.primary_body_part in secondary:
            raise ValueError("主な部位と補助部位は重複できません")
        self.secondary_body_parts = sorted(secondary, key=BODY_PARTS.index)
        return self


class ExerciseOptionInput(BodyPartSelection):
    name: Name


class ExerciseOptionUpdate(BodyPartSelection):
    primary_body_part: BodyPart | None
    secondary_body_parts: list[BodyPart] = Field(max_length=8)
    expected_revision: int = Field(ge=1, strict=True)
