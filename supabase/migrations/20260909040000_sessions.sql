ALTER TABLE public.gotore_workouts
  ADD COLUMN started_at timestamptz,
  ADD COLUMN ended_at timestamptz,
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN feed_exercise integer,
  ADD COLUMN feed_set integer,
  ADD COLUMN feed_best boolean NOT NULL DEFAULT false,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.gotore_workouts DROP CONSTRAINT gotore_workouts_exercises_check;
ALTER TABLE public.gotore_workouts ADD CONSTRAINT gotore_workouts_exercises_check CHECK (
  jsonb_typeof(exercises) = 'array' AND jsonb_array_length(exercises) <= 20
  AND (started_at IS NOT NULL OR jsonb_array_length(exercises) >= 1)
);
ALTER TABLE public.gotore_workouts ADD CONSTRAINT gotore_session_times_check CHECK (
  (started_at IS NULL AND ended_at IS NULL AND last_seen_at IS NULL)
  OR (started_at IS NOT NULL AND last_seen_at IS NOT NULL
      AND (ended_at IS NULL OR ended_at >= started_at))
);
CREATE UNIQUE INDEX gotore_one_active_session
  ON public.gotore_workouts(user_id) WHERE started_at IS NOT NULL AND ended_at IS NULL;
ALTER TABLE public.gotore_workouts ADD CONSTRAINT gotore_workout_owner UNIQUE (id, user_id);

CREATE TABLE public.gotore_workout_shares (
  workout_id uuid NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY (workout_id, group_id),
  FOREIGN KEY (workout_id, user_id) REFERENCES public.gotore_workouts(id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (group_id, user_id) REFERENCES public.gotore_group_members(group_id, user_id)
    ON DELETE CASCADE
);
CREATE INDEX gotore_workout_shares_group_idx ON public.gotore_workout_shares(group_id, workout_id);

CREATE TABLE public.gotore_session_days (
  workout_id uuid NOT NULL REFERENCES public.gotore_workouts(id) ON DELETE CASCADE,
  day date NOT NULL,
  PRIMARY KEY (workout_id, day)
);

CREATE TABLE public.gotore_exercise_memos (
  user_id uuid NOT NULL REFERENCES public.gotore_profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  content text NOT NULL CHECK (char_length(content) <= 1000),
  revision integer NOT NULL CHECK (revision >= 1),
  PRIMARY KEY (user_id, name)
);

ALTER TABLE public.gotore_workout_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_session_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_exercise_memos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_workout_shares, public.gotore_session_days,
  public.gotore_exercise_memos FROM PUBLIC;
