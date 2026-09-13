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


BodyPart = Literal["chest", "back", "legs", "arms", "shoulders", "abs", "glutes", "other"]
BODY_PARTS = ("chest", "back", "legs", "arms", "shoulders", "abs", "glutes", "other")
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
    primary_body_part: BodyPart = "other"
    secondary_body_parts: list[BodyPart] = Field(default_factory=list, max_length=7)

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_parts(cls, value):
        if not isinstance(value, dict):
            return value
        result = dict(value)
        primary = result.get("primary_body_part")
        if "primary_body_part" in result and (primary is None or primary == "full_body"):
            result["primary_body_part"] = "other"
        secondary = result.get("secondary_body_parts")
        if isinstance(secondary, list) and (
            primary in secondary or any(part in secondary[:i] for i, part in enumerate(secondary))
        ):
            raise ValueError("主な部位と補助部位は重複できません")
        if isinstance(secondary, list) and "full_body" in secondary:
            # 旧全身とその他が合流して生じる重複だけを取り除く。
            normalized = ["other" if part == "full_body" else part for part in secondary]
            result["secondary_body_parts"] = [
                part
                for i, part in enumerate(normalized)
                if part != "other"
                or (result.get("primary_body_part") != "other" and "other" not in normalized[:i])
            ]
        elif primary == "full_body" and isinstance(secondary, list):
            result["secondary_body_parts"] = [part for part in secondary if part != "other"]
        return result

    @model_validator(mode="after")
    def valid_parts(self):
        secondary = self.secondary_body_parts
        if len(set(secondary)) != len(secondary) or self.primary_body_part in secondary:
            raise ValueError("主な部位と補助部位は重複できません")
        self.secondary_body_parts = sorted(secondary, key=BODY_PARTS.index)
        return self


class ExerciseOptionInput(BodyPartSelection):
    name: Name


class ExerciseOptionUpdate(BodyPartSelection):
    primary_body_part: BodyPart
    secondary_body_parts: list[BodyPart] = Field(max_length=7)
    expected_revision: int = Field(ge=1, strict=True)
