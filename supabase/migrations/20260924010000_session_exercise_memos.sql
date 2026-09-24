CREATE TABLE public.gotore_session_exercise_memos (
  workout_id uuid NOT NULL REFERENCES public.gotore_workouts(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  content text NOT NULL CHECK (char_length(content) <= 1000),
  revision integer NOT NULL CHECK (revision >= 1),
  PRIMARY KEY (workout_id, name)
);

-- 本人用の当日・種目別メモは、認可済みAPIからだけ操作する。
ALTER TABLE public.gotore_session_exercise_memos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_session_exercise_memos FROM PUBLIC;
