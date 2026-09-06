CREATE TABLE public.gotore_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 20)
);

CREATE TABLE public.gotore_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  owner_id uuid NOT NULL REFERENCES public.gotore_profiles(id),
  invite_code text NOT NULL UNIQUE CHECK (invite_code ~ '^[A-F0-9]{12}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gotore_group_members (
  group_id uuid NOT NULL REFERENCES public.gotore_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.gotore_profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX gotore_group_members_user_idx ON public.gotore_group_members(user_id);

CREATE TABLE public.gotore_workouts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.gotore_profiles(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.gotore_groups(id),
  performed_on date NOT NULL CHECK (performed_on >= DATE '2000-01-01'),
  exercises jsonb NOT NULL CHECK (
    jsonb_typeof(exercises) = 'array' AND jsonb_array_length(exercises) BETWEEN 1 AND 20
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (group_id, user_id) REFERENCES public.gotore_group_members(group_id, user_id)
);
CREATE INDEX gotore_workouts_user_idx
  ON public.gotore_workouts(user_id, performed_on DESC, created_at DESC, id);
CREATE INDEX gotore_workouts_group_idx
  ON public.gotore_workouts(group_id, created_at DESC, id);

-- 業務データは認証・権限を検証するFastAPIから操作する。
ALTER TABLE public.gotore_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_workouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_profiles, public.gotore_groups,
  public.gotore_group_members, public.gotore_workouts FROM PUBLIC;
