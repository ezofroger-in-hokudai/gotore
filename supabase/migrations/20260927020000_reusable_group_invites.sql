ALTER TABLE public.gotore_group_invites
  DROP CONSTRAINT gotore_group_invites_pkey;

ALTER TABLE public.gotore_group_invites
  ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.gotore_group_invites
  ADD CONSTRAINT gotore_group_invites_pkey PRIMARY KEY (id);

CREATE INDEX gotore_group_invites_group_id_idx
  ON public.gotore_group_invites (group_id);
