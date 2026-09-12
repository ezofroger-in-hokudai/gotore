from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

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


def estimated_rm(weight: float | Decimal, reps: int) -> float | None:
    if weight <= 0 or not 1 <= reps <= 10:
        return None
    value = Decimal(str(weight))
    if reps > 1:
        value *= 1 + Decimal(reps) / 30
    return float(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def personal_bests(sets: list[dict]) -> dict:
    weights = [float(s["weight"]) for s in sets]
    rms = [rm for s in sets if (rm := estimated_rm(s["weight"], s["reps"])) is not None]
    return {"best_weight": max(weights, default=None), "best_rm": max(rms, default=None)}


def session_best_sets(exercises: list[dict], other_exercises: list[dict]) -> list[dict]:
    """更新したセットのうち、現在も最高重量またはRMを保つ位置を返す。"""
    names = {e["name"] for e in exercises}
    bests = {
        name: personal_bests([s for e in other_exercises if e["name"] == name for s in e["sets"]])
        for name in names
    }
    return session_best_sets_from_bests(exercises, bests)


def session_best_sets_from_bests(
    exercises: list[dict], previous_bests: dict[str, dict]
) -> list[dict]:
    """過去の集計値を基準に今回の更新位置を判定し、渡された集計値は変えない。"""
    bests = {
        name: dict(previous_bests.get(name, {"best_weight": None, "best_rm": None}))
        for name in {e["name"] for e in exercises}
    }
    candidates = []
    for ei, exercise in enumerate(exercises):
        best = bests[exercise["name"]]
        for si, value in enumerate(exercise["sets"]):
            weight = float(value["weight"])
            rm = estimated_rm(weight, value["reps"])
            improved_weight = best["best_weight"] is not None and weight > best["best_weight"]
            improved_rm = rm is not None and best["best_rm"] is not None and rm > best["best_rm"]
            candidates.append(
                (ei, si, weight if improved_weight else None, rm if improved_rm else None)
            )
            best["best_weight"] = max(weight, best["best_weight"] or 0)
            if rm is not None:
                best["best_rm"] = max(rm, best["best_rm"] or 0)
    return [
        {"exercise_index": ei, "set_index": si}
        for ei, si, weight, rm in candidates
        if (weight is not None and weight == bests[exercises[ei]["name"]]["best_weight"])
        or (rm is not None and rm == bests[exercises[ei]["name"]]["best_rm"])
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
