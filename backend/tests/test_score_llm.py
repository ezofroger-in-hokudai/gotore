import json

import httpx
import pytest

from app.infrastructure.score_llm import ScoreLLM, make_goal_input, validate_evaluation


def snapshot():
    return {
        "performed_on": "2026-09-12",
        "exercises": [{"name": "ベンチ", "sets": [{"weight": 60, "reps": 8}]}],
        "goal": {
            "body": "筋トレを続ける",
            "id": "private-id",
            "user_id": "private-user",
            "created_at": "2026-09-12T00:00:00+09:00",
            "version": 1,
            "criteria": [
                {"text": "筋トレに取り組む", "observation_days": 1},
                {"text": "1週間の計画に沿う", "observation_days": 7},
            ],
        },
        "history": [],
        "history_complete": True,
        "baseline": {"id": "not-for-llm"},
        "memo": "not-for-llm",
    }


def test_llm_input_whitelists_fields_and_bounds_history():
    data = snapshot()
    data["history"] = [{"performed_on": "2026-09-12", "exercises": data["exercises"]}] * 1000
    result = make_goal_input(data)
    serialized = json.dumps(result, ensure_ascii=False)
    assert "private-" not in serialized
    assert "not-for-llm" not in serialized
    assert len(serialized) <= 16000
    assert result["history_complete"] is False


def test_insufficient_observation_overrides_llm_positive_judgment():
    result = {
        "judgments": [{"rating": 1, "reason": "実施した"}, {"rating": 1, "reason": "実施した"}],
        "comment": "今日の取り組みを記録できました。",
    }
    parsed = validate_evaluation(result, make_goal_input(snapshot()))
    assert parsed["judgments"][0]["rating"] == 1
    assert parsed["judgments"][1]["rating"] is None
    assert parsed["g"] is None


@pytest.mark.parametrize("ratings", [[1], [1, 0.7], [True, 1], [1, 1, 1]])
def test_invalid_judgments_cannot_be_saved(ratings):
    with pytest.raises(ValueError):
        validate_evaluation(
            {
                "judgments": [{"rating": r, "reason": "理由"} for r in ratings],
                "comment": "ひとこと",
            },
            make_goal_input(snapshot()),
        )


@pytest.mark.parametrize(
    ("requested_model", "effort"),
    [
        ("gpt-5-nano", "minimal"),
        ("gpt-5-nano-2025-08-07", "minimal"),
        ("gpt-5.6-luna", "none"),
    ],
)
def test_openai_request_is_short_structured_and_not_stored(requested_model, effort):
    calls = []

    def handle(request):
        calls.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "status": "completed",
                "model": "selected-snapshot",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps(
                                    {
                                        "judgments": [
                                            {"rating": 1, "reason": "筋トレを実施"},
                                            {"rating": None, "reason": "期間不足"},
                                        ],
                                        "comment": "一歩ずつ続けていきましょう。",
                                    }
                                ),
                            }
                        ],
                    }
                ],
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        llm = ScoreLLM("test-key", requested_model, client=client)
        result, model = llm.evaluate(make_goal_input(snapshot()))
    assert model == "selected-snapshot"
    assert result["g"] is None
    assert calls[0]["store"] is False
    assert calls[0]["model"] == requested_model
    assert calls[0]["reasoning"] == {"effort": effort}
    assert calls[0]["text"]["format"]["strict"] is True
    assert calls[0]["max_output_tokens"] <= 1200
    assert "tools" not in calls[0]


def test_refusal_or_incomplete_is_not_a_fake_comment():
    for response in (
        {"status": "incomplete"},
        {
            "status": "completed",
            "output": [{"type": "message", "content": [{"type": "refusal", "refusal": "no"}]}],
        },
    ):
        with httpx.Client(
            transport=httpx.MockTransport(lambda r: httpx.Response(200, json=response))
        ) as client:
            with pytest.raises(ValueError):
                ScoreLLM("test-key", "gpt-5-nano", client=client).evaluate(
                    make_goal_input(snapshot())
                )
