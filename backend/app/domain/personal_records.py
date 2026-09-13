from decimal import ROUND_HALF_UP, Decimal


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


def record_best_sets(exercises: list[dict], baseline: dict[str, dict]) -> list[dict]:
    """他の実績とセット順を基準に、現在も最高値を保つ更新セットを返す。"""
    bests = {
        exercise["name"]: dict(
            baseline.get(exercise["name"], {"best_weight": None, "best_rm": None})
        )
        for exercise in exercises
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
    result = []
    for ei, si, weight, rm in candidates:
        best = bests[exercises[ei]["name"]]
        weight_best = weight is not None and weight == best["best_weight"]
        rm_best = rm is not None and rm == best["best_rm"]
        if weight_best or rm_best:
            result.append(
                {"exercise_index": ei, "set_index": si, "weight": weight_best, "rm": rm_best}
            )
    return result
