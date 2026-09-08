from pydantic import BaseModel, ConfigDict

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


class ExerciseOptionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
