-- 空リストと未初期化を区別し、削除した既定候補を復活させない。
CREATE TABLE public.gotore_exercise_catalogs (
  user_id uuid PRIMARY KEY REFERENCES public.gotore_profiles(id) ON DELETE CASCADE
);

CREATE TABLE public.gotore_exercise_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.gotore_exercise_catalogs(user_id) ON DELETE CASCADE,
  name text NOT NULL CHECK (
    name = btrim(name) AND char_length(btrim(name)) BETWEEN 1 AND 60
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.gotore_exercise_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_exercise_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_exercise_catalogs, public.gotore_exercise_options FROM PUBLIC;
