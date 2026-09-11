-- 本人用の確定総合点を保存し、カレンダーは採点根拠JSONを展開せず集計する。
ALTER TABLE public.gotore_workout_scores
    ADD COLUMN personal_total integer CHECK (personal_total BETWEEN 0 AND 100);

-- 導入済みscore-v1の確定結果だけを同じ基本配点・四捨五入で移す。
UPDATE public.gotore_workout_scores
SET personal_total = round(
    (components->>'c')::numeric * 0.30 + (components->>'i')::numeric * 0.20
    + (components->>'v')::numeric * 0.40 + (components->>'g')::numeric * 0.10
)::integer
WHERE formula_version = 'score-v1' AND status = 'complete';
