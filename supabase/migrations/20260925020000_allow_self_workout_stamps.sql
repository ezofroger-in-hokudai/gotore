-- 本人の記録へ送る反応も、他者からの反応と同じ記録単位で保存する。
ALTER TABLE public.gotore_workout_stamps
  DROP CONSTRAINT IF EXISTS gotore_workout_stamps_check;
