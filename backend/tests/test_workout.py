from datetime import date, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError

from app.domain.workout import WorkoutInput


def payload(**changes):
    return {
        "id": str(uuid4()),
        "performed_on": "2026-01-01",
        "group_id": None,
        "exercises": [{"name": " ベンチプレス ", "sets": [{"weight": 80.5, "reps": 8}]}],
        **changes,
    }


def test_trims_names_and_allows_bodyweight():
    workout = WorkoutInput.model_validate(
        payload(exercises=[{"name": " 懸垂 ", "sets": [{"weight": 0, "reps": 10}]}])
    )
    assert workout.exercises[0].name == "懸垂"
    assert workout.exercises[0].sets[0].weight == 0


@pytest.mark.parametrize(
    "weight,reps",
    [(-1, 8), (1001, 8), (0.01, 8), (80, 0), (80, 1.5), (80, 1001), (float("nan"), 8)],
)
def test_rejects_invalid_sets(weight, reps):
    with pytest.raises(ValidationError):
        WorkoutInput.model_validate(
            payload(exercises=[{"name": "ベンチ", "sets": [{"weight": weight, "reps": reps}]}])
        )


@pytest.mark.parametrize(
    "exercises",
    [[], [{"name": " ", "sets": [{"weight": 1, "reps": 1}]}], [{"name": "ベンチ", "sets": []}]],
)
def test_requires_named_exercises_and_sets(exercises):
    with pytest.raises(ValidationError):
        WorkoutInput.model_validate(payload(exercises=exercises))


def test_rejects_future_and_too_old_dates():
    tomorrow = datetime.now(ZoneInfo("Asia/Tokyo")).date() + timedelta(days=1)
    for day in [date(1999, 12, 31), tomorrow]:
        with pytest.raises(ValidationError):
            WorkoutInput.model_validate(payload(performed_on=day))
