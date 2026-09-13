from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.personal_records import estimated_rm as estimated_rm
from app.domain.personal_records import personal_bests as personal_bests
from app.domain.personal_records import record_best_sets
from app.domain.workout import Exercise, Name


class SessionStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID


class SessionRevision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1, strict=True)


class SessionUpdate(SessionRevision):
    exercises: list[Exercise] = Field(max_length=20)


class ExerciseMemoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    content: str = Field(max_length=1000)
    expected_revision: int = Field(ge=0, strict=True)


def session_best_sets(exercises: list[dict], other_exercises: list[dict]) -> list[dict]:
    names = {e["name"] for e in exercises}
    baseline = {
        name: personal_bests([s for e in other_exercises if e["name"] == name for s in e["sets"]])
        for name in names
    }
    return session_best_sets_from_bests(exercises, baseline)


def session_best_sets_from_bests(
    exercises: list[dict], previous_bests: dict[str, dict]
) -> list[dict]:
    """現在の最高記録判定を共用し、旧形式の更新位置だけを返す。"""
    return [
        {"exercise_index": value["exercise_index"], "set_index": value["set_index"]}
        for value in record_best_sets(exercises, previous_bests)
    ]


def latest_change(before: list[dict], after: list[dict]) -> tuple[int, int, bool] | None:
    """変更したセットの位置と、既存セットを変えない純粋な追加かを返す。"""
    old = [(e["name"], s) for e in before for s in e["sets"]]
    new = [(e["name"], s) for e in after for s in e["sets"]]
    added = len(new) == len(old) + 1
    change = None
    for i, exercise in enumerate(after):
        prior = before[i] if i < len(before) and before[i]["name"] == exercise["name"] else None
        for j, value in enumerate(exercise["sets"]):
            if prior is None or j >= len(prior["sets"]) or prior["sets"][j] != value:
                change = (i, j)
    if change is None:
        return (len(after) - 1, len(after[-1]["sets"]) - 1, False) if after else None
    i, j = change
    without_added = [
        (e["name"], s)
        for ei, e in enumerate(after)
        for si, s in enumerate(e["sets"])
        if (ei, si) != (i, j)
    ]
    return i, j, added and without_added == old
