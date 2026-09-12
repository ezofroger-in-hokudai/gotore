from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.session import estimated_rm

FORMULA_VERSION = "score-v2"
HUNDRED = Decimal(100)
REACH = Decimal("0.95")
Percentage = Annotated[int, Field(strict=True, ge=0, le=100)]


class ScoreWeights(BaseModel):
    model_config = ConfigDict(extra="forbid")
    c: Percentage = 30
    i: Percentage = 20
    v: Percentage = 40
    g: Percentage = 10

    @model_validator(mode="after")
    def sum_to_100(self):
        if self.c + self.i + self.v + self.g != 100:
            raise ValueError("配点の合計は100%にしてください")
        return self


@dataclass(frozen=True)
class ExerciseStatistics:
    sets: int
    volume: Decimal
    rm: Decimal | None


def summarize_exercises(exercises: list[dict]) -> dict[str, ExerciseStatistics]:
    result: dict[str, ExerciseStatistics] = {}
    for exercise in exercises:
        name = exercise["name"].strip()
        prior = result.get(name, ExerciseStatistics(0, Decimal(0), None))
        sets = exercise["sets"]
        volume = sum((Decimal(str(s["weight"])) * s["reps"] for s in sets), Decimal(0))
        rms = [
            Decimal(str(rm))
            for s in sets
            if (rm := estimated_rm(s["weight"], s["reps"])) is not None
        ]
        if prior.rm is not None:
            rms.append(prior.rm)
        result[name] = ExerciseStatistics(
            prior.sets + len(sets), prior.volume + volume, max(rms, default=None)
        )
    return result


def volume_score(current: Decimal, baseline: Decimal | None) -> Decimal | None:
    if baseline is None or baseline <= 0:
        return None
    return min(HUNDRED, HUNDRED * current / (REACH * baseline))


def intensity_score(
    current: dict[str, Decimal | None], baseline: dict[str, Decimal | None]
) -> Decimal | None:
    if not current or current.keys() != baseline.keys():
        return None
    scores = []
    for name, rm in current.items():
        if rm is None or (value := volume_score(rm, baseline[name])) is None:
            return None
        scores.append(value)
    return sum(scores, Decimal(0)) / len(scores)


def consistency_score(day: date, first_day: date | None, active_days: list[date]) -> Decimal | None:
    if first_day is None:
        return None
    blocks = min(4, ((day - first_day).days + 1) // 7)
    if blocks <= 0:
        return None
    counts = [0] * blocks
    for active in set(active_days):
        offset = (day - active).days
        if 0 <= offset < blocks * 7:
            counts[offset // 7] += 1
    return HUNDRED * sum(min(Decimal(1), Decimal(n) / 2) for n in counts) / blocks


def goal_score(judgments: list[float | None]) -> Decimal | None:
    if not 2 <= len(judgments) <= 4 or any(
        isinstance(value, bool) or value not in (None, 0, 0.5, 1) for value in judgments
    ):
        raise ValueError("目標の判定を確認してください")
    if None in judgments:
        return None
    return HUNDRED * sum(Decimal(str(value)) for value in judgments) / len(judgments)


def total_score(components: dict[str, Decimal | None], weights: ScoreWeights) -> int | None:
    total = Decimal(0)
    for name, weight in weights.model_dump().items():
        value = components.get(name)
        if weight and value is None:
            return None
        if value is not None:
            if not value.is_finite() or not 0 <= value <= HUNDRED:
                raise ValueError("点数の範囲を確認してください")
            total += value * weight / HUNDRED
    return int(total.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def apply_initial_benchmark(
    components: dict[str, Decimal | None], exercises: list[dict]
) -> tuple[dict[str, Decimal | None], list[str]]:
    """比較できない項目だけ、合意した初回基準で補う。目標判定は補わない。"""
    reps: dict[str, int] = {}
    for exercise in exercises:
        if exercise["sets"]:
            name = exercise["name"].strip()
            reps[name] = reps.get(name, 0) + sum(s["reps"] for s in exercise["sets"])
    result = dict(components)
    if not reps:
        return result, []
    initial_axes = [axis for axis in ("c", "i", "v") if result[axis] is None]
    for axis in initial_axes:
        result[axis] = (
            sum((min(HUNDRED, HUNDRED * count / 30) for count in reps.values()), Decimal(0))
            / len(reps)
            if axis == "v"
            else HUNDRED
        )
    return result, initial_axes
