CREATE TABLE public.gotore_goal_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.gotore_profiles(id) ON DELETE CASCADE,
    version integer NOT NULL CHECK (version > 0),
    body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
    is_standard boolean NOT NULL,
    criteria jsonb NOT NULL CHECK (jsonb_typeof(criteria) = 'array' AND jsonb_array_length(criteria) BETWEEN 2 AND 4),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (user_id, version),
    UNIQUE (id, user_id)
);

CREATE TABLE public.gotore_workout_goals (
    workout_id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    goal_id uuid NOT NULL,
    FOREIGN KEY (workout_id, user_id) REFERENCES public.gotore_workouts(id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (goal_id, user_id) REFERENCES public.gotore_goal_versions(id, user_id) ON DELETE CASCADE
);

CREATE TABLE public.gotore_score_observations (
    user_id uuid PRIMARY KEY REFERENCES public.gotore_profiles(id) ON DELETE CASCADE,
    first_day date NOT NULL
);

-- 観測開始日は削除で巻き戻さず、過去日への追記時には早い日を保持する。
CREATE FUNCTION public.gotore_observe_training()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF (NEW.started_at IS NULL OR NEW.ended_at IS NOT NULL) AND jsonb_array_length(NEW.exercises) > 0 THEN
        INSERT INTO public.gotore_score_observations (user_id, first_day)
        VALUES (NEW.user_id, NEW.performed_on)
        ON CONFLICT (user_id) DO UPDATE SET first_day = least(gotore_score_observations.first_day, EXCLUDED.first_day)
        WHERE EXCLUDED.first_day < gotore_score_observations.first_day;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER gotore_observe_insert AFTER INSERT ON public.gotore_workouts
FOR EACH ROW EXECUTE FUNCTION public.gotore_observe_training();
CREATE TRIGGER gotore_observe_update AFTER UPDATE OF exercises, performed_on, ended_at ON public.gotore_workouts
FOR EACH ROW EXECUTE FUNCTION public.gotore_observe_training();
REVOKE ALL ON FUNCTION public.gotore_observe_training() FROM PUBLIC;

INSERT INTO public.gotore_score_observations (user_id, first_day)
SELECT user_id, min(performed_on) FROM public.gotore_workouts
WHERE (started_at IS NULL OR ended_at IS NOT NULL) AND jsonb_array_length(exercises) > 0
GROUP BY user_id;

CREATE TABLE public.gotore_workout_scores (
    workout_id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    revision integer NOT NULL CHECK (revision > 0),
    goal_id uuid NOT NULL,
    components jsonb NOT NULL CHECK (jsonb_typeof(components) = 'object'),
    snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete')),
    goal_result jsonb,
    formula_version text NOT NULL,
    prompt_version text NOT NULL,
    model text,
    lease_id uuid,
    lease_until timestamptz,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (workout_id, user_id) REFERENCES public.gotore_workouts(id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (goal_id, user_id) REFERENCES public.gotore_goal_versions(id, user_id) ON DELETE CASCADE
);

CREATE TABLE public.gotore_group_score_weights (
    group_id uuid NOT NULL REFERENCES public.gotore_groups(id) ON DELETE CASCADE,
    version integer NOT NULL CHECK (version > 0),
    effective_on date NOT NULL,
    c integer NOT NULL CHECK (c BETWEEN 0 AND 100),
    i integer NOT NULL CHECK (i BETWEEN 0 AND 100),
    v integer NOT NULL CHECK (v BETWEEN 0 AND 100),
    g integer NOT NULL CHECK (g BETWEEN 0 AND 100),
    CHECK (c + i + v + g = 100),
    PRIMARY KEY (group_id, version)
);
CREATE INDEX gotore_group_weights_effective ON public.gotore_group_score_weights(group_id, effective_on DESC, version DESC);

CREATE TABLE public.gotore_ai_usage (
    user_id uuid NOT NULL REFERENCES public.gotore_profiles(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('score', 'proposal')),
    day date NOT NULL,
    calls integer NOT NULL CHECK (calls > 0),
    PRIMARY KEY (user_id, kind)
);
ALTER TABLE public.gotore_ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_ai_usage FROM PUBLIC;

ALTER TABLE public.gotore_goal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_workout_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_score_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_workout_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_group_score_weights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_goal_versions, public.gotore_workout_goals,
    public.gotore_score_observations, public.gotore_workout_scores,
    public.gotore_group_score_weights FROM PUBLIC;
