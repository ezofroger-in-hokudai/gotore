ALTER TABLE public.gotore_workouts
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1);

-- 削除した本文は保持せず、古い保存要求の再送を拒否するためのIDだけを残す。
CREATE TABLE public.gotore_deleted_workouts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.gotore_profiles(id) ON DELETE CASCADE,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gotore_deleted_workouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_deleted_workouts FROM PUBLIC;
