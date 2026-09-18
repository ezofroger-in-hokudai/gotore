-- 旧4種類の意味と既存反応を保持して、採用された6種類を追加する。
ALTER TABLE public.gotore_workout_stamps
    DROP CONSTRAINT gotore_workout_stamps_kind_check;
ALTER TABLE public.gotore_workout_stamps
    ADD CONSTRAINT gotore_workout_stamps_kind_check
    CHECK (kind IN ('clap','fire','muscle','eyes',
                   'encourage','push','bad','amazing','praise','tengu'));
