CREATE TABLE public.gotore_avatars (
  user_id uuid PRIMARY KEY REFERENCES public.gotore_profiles(id) ON DELETE CASCADE,
  version uuid NOT NULL,
  image bytea NOT NULL CHECK (octet_length(image) BETWEEN 1 AND 131072)
);

-- 本人の更新と同一グループの閲覧を検証する専用APIからだけ扱う。
ALTER TABLE public.gotore_avatars ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_avatars FROM PUBLIC;
