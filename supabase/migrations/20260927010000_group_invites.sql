ALTER TABLE public.gotore_groups
  ADD COLUMN invite_expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days');

CREATE TABLE public.gotore_group_invites (
  group_id uuid PRIMARY KEY REFERENCES public.gotore_groups(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES public.gotore_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK (expires_at > created_at)
);

ALTER TABLE public.gotore_group_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_group_invites FROM PUBLIC, anon, authenticated;
