CREATE TABLE public.gotore_workout_memos (
  workout_id uuid PRIMARY KEY REFERENCES public.gotore_workouts(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 1000),
  revision integer NOT NULL CHECK (revision >= 1)
);

-- 本人権限を確認する専用APIだけで扱い、共有一覧からは参照しない。
ALTER TABLE public.gotore_workout_memos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_workout_memos FROM PUBLIC;
