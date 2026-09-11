import httpx

from app.core.config import settings
from app.domain.errors import ServiceUnavailable
from app.infrastructure.score_llm import ScoreLLM
from app.infrastructure.scores import ScoreRepository


def evaluate_score(connections, user_id, workout_id):
    # 外部APIを待つ間はプール接続と記録ロックを返し、他の記録操作を妨げない。
    with connections() as connection:
        repo = ScoreRepository(connection)
        existing = repo.get(user_id, workout_id)
        if existing is None or existing["status"] == "complete":
            return existing
        if not settings.openai_api_key:
            raise ServiceUnavailable("AIの接続設定を確認してください。記録は保存済みです")
        claimed = repo.claim(user_id, workout_id, settings.score_model, settings.score_daily_limit)
        if claimed is None:
            return repo.get(user_id, workout_id)
    try:
        snapshot = claimed["snapshot"]
        evaluation, model = ScoreLLM(settings.openai_api_key, claimed["model"]).evaluate(
            snapshot["llm_input"], snapshot["llm_prompt"]
        )
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        with connections() as connection:
            ScoreRepository(connection).failed(claimed)
        raise ServiceUnavailable("AIの評価を取得できませんでした。記録は保存済みです") from None
    with connections() as connection:
        repo = ScoreRepository(connection)
        repo.complete(claimed, evaluation, model)
        return repo.get(user_id, workout_id)


def propose_goal(connections, user, body):
    if not settings.openai_api_key:
        raise ServiceUnavailable("AIの接続設定を確認してください")
    with connections() as connection:
        repo = ScoreRepository(connection)
        repo.profile(user)
        repo.consume_ai_call(user.id, "proposal", settings.goal_proposal_daily_limit)
    try:
        return ScoreLLM(settings.openai_api_key, settings.score_model).propose(body)
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise ServiceUnavailable(
            "評価基準を作成できませんでした。目標の入力は残っています"
        ) from None
