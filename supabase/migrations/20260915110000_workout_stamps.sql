CREATE TABLE public.gotore_workout_stamps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  group_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('clap','fire','muscle','eyes')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  announced_at timestamptz,
  read_at timestamptz,
  CHECK (sender_id <> recipient_id),
  UNIQUE (workout_id, group_id, sender_id, kind),
  FOREIGN KEY (workout_id, recipient_id) REFERENCES public.gotore_workouts(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id,sender_id) REFERENCES public.gotore_group_members(group_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id,recipient_id) REFERENCES public.gotore_group_members(group_id,user_id) ON DELETE CASCADE
);
CREATE INDEX gotore_stamps_inbox_idx ON public.gotore_workout_stamps(recipient_id,created_at DESC,id);
CREATE INDEX gotore_stamps_group_idx ON public.gotore_workout_stamps(group_id,workout_id);
ALTER TABLE public.gotore_workout_stamps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_workout_stamps FROM PUBLIC, anon, authenticated;

-- 共有を解除した反応を再共有・再参加で復活させない。
CREATE FUNCTION public.gotore_prune_workout_stamps() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'gotore_workout_shares' THEN
    DELETE FROM public.gotore_workout_stamps r
    WHERE r.workout_id = OLD.workout_id AND r.group_id = OLD.group_id
      AND NOT EXISTS (SELECT 1 FROM public.gotore_workouts w
        WHERE w.id = r.workout_id AND w.group_id = r.group_id);
  ELSE
    DELETE FROM public.gotore_workout_stamps r WHERE r.workout_id = NEW.id
      AND NOT (EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.exercises) e
          WHERE jsonb_array_length(e->'sets') > 0)
        AND (NEW.group_id = r.group_id OR EXISTS (
          SELECT 1 FROM public.gotore_workout_shares s
          WHERE s.workout_id = NEW.id AND s.group_id = r.group_id)) IS TRUE);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER gotore_stamps_share_removed AFTER DELETE ON public.gotore_workout_shares
FOR EACH ROW EXECUTE FUNCTION public.gotore_prune_workout_stamps();
CREATE TRIGGER gotore_stamps_workout_changed AFTER UPDATE OF group_id,exercises ON public.gotore_workouts
FOR EACH ROW EXECUTE FUNCTION public.gotore_prune_workout_stamps();
REVOKE ALL ON FUNCTION public.gotore_prune_workout_stamps() FROM PUBLIC;
