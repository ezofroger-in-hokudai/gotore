-- 採点を一時停止し、記録時の採点用書き込みも止める。過去の得点・目標は保持する。
DROP TRIGGER IF EXISTS gotore_observe_insert ON public.gotore_workouts;
DROP TRIGGER IF EXISTS gotore_observe_update ON public.gotore_workouts;
