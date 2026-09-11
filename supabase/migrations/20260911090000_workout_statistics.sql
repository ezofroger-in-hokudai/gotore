-- 閲覧では全セットJSONを展開せず、記録×種目の集計から推移を取得する。
CREATE TABLE public.gotore_workout_statistics (
    workout_id uuid NOT NULL REFERENCES public.gotore_workouts(id) ON DELETE CASCADE,
    exercise_name text NOT NULL,
    set_count integer NOT NULL CHECK (set_count > 0),
    volume numeric NOT NULL CHECK (volume >= 0),
    best_weight numeric NOT NULL CHECK (best_weight >= 0),
    best_rm numeric,
    PRIMARY KEY (workout_id, exercise_name)
);
ALTER TABLE public.gotore_workout_statistics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_workout_statistics FROM PUBLIC;

CREATE FUNCTION public.gotore_summarize_exercises(exercises jsonb)
RETURNS TABLE (exercise_name text, set_count integer, volume numeric, best_weight numeric, best_rm numeric)
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
    SELECT btrim(e->>'name'), count(*)::integer,
           sum((s->>'weight')::numeric * (s->>'reps')::integer),
           max((s->>'weight')::numeric),
           max(CASE
               WHEN (s->>'weight')::numeric <= 0 OR (s->>'reps')::integer NOT BETWEEN 1 AND 10 THEN NULL
               WHEN (s->>'reps')::integer = 1 THEN round((s->>'weight')::numeric, 1)
               ELSE round((s->>'weight')::numeric * (1 + (s->>'reps')::numeric / 30), 1)
           END)
    FROM jsonb_array_elements(exercises) e
    CROSS JOIN LATERAL jsonb_array_elements(e->'sets') s
    GROUP BY btrim(e->>'name')
$$;
REVOKE ALL ON FUNCTION public.gotore_summarize_exercises(jsonb) FROM PUBLIC;

CREATE FUNCTION public.gotore_refresh_workout_statistics()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    DELETE FROM public.gotore_workout_statistics WHERE workout_id = NEW.id;
    INSERT INTO public.gotore_workout_statistics
    SELECT NEW.id, summary.* FROM public.gotore_summarize_exercises(NEW.exercises) summary;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.gotore_refresh_workout_statistics() FROM PUBLIC;

CREATE TRIGGER gotore_statistics_insert AFTER INSERT ON public.gotore_workouts
FOR EACH ROW EXECUTE FUNCTION public.gotore_refresh_workout_statistics();
CREATE TRIGGER gotore_statistics_update AFTER UPDATE OF exercises ON public.gotore_workouts
FOR EACH ROW WHEN (OLD.exercises IS DISTINCT FROM NEW.exercises)
EXECUTE FUNCTION public.gotore_refresh_workout_statistics();

-- 既存記録を補完。記録本体や共有先は変更しない。
INSERT INTO public.gotore_workout_statistics
SELECT w.id, summary.* FROM public.gotore_workouts w
CROSS JOIN LATERAL public.gotore_summarize_exercises(w.exercises) summary;
