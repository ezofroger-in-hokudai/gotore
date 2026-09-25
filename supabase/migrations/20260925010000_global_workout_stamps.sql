-- スタンプはグループではなく、記録に対する反応として保存する。
-- 既存の同一送信者・同一種類の重複は、最初の送信に統合する。
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER stamp AS keeper_id,
    bool_or(announced_at IS NULL) OVER stamp AS has_unannounced,
    bool_or(read_at IS NULL) OVER stamp AS has_unread
  FROM public.gotore_workout_stamps
  WINDOW stamp AS (
    PARTITION BY workout_id, sender_id, kind
    ORDER BY created_at, id
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  )
), normalized AS (
  SELECT DISTINCT keeper_id, has_unannounced, has_unread FROM ranked
)
UPDATE public.gotore_workout_stamps r
SET
  announced_at = CASE WHEN n.has_unannounced THEN NULL ELSE r.announced_at END,
  read_at = CASE WHEN n.has_unread THEN NULL ELSE r.read_at END
FROM normalized n
WHERE r.id = n.keeper_id;

WITH ranked AS (
  SELECT id, first_value(id) OVER stamp AS keeper_id
  FROM public.gotore_workout_stamps
  WINDOW stamp AS (
    PARTITION BY workout_id, sender_id, kind
    ORDER BY created_at, id
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  )
)
DELETE FROM public.gotore_workout_stamps r
USING ranked
WHERE r.id = ranked.id AND ranked.id <> ranked.keeper_id;

ALTER TABLE public.gotore_workout_stamps
  DROP CONSTRAINT IF EXISTS gotore_workout_stamps_workout_id_group_id_sender_id_kind_key,
  DROP CONSTRAINT IF EXISTS gotore_workout_stamps_group_id_sender_id_fkey,
  DROP CONSTRAINT IF EXISTS gotore_workout_stamps_group_id_recipient_id_fkey;
DROP INDEX IF EXISTS public.gotore_stamps_group_idx;
ALTER TABLE public.gotore_workout_stamps DROP COLUMN group_id;
ALTER TABLE public.gotore_workout_stamps
  ADD CONSTRAINT gotore_workout_stamps_workout_sender_kind_key
  UNIQUE (workout_id, sender_id, kind);
CREATE INDEX gotore_stamps_workout_idx ON public.gotore_workout_stamps(workout_id, created_at DESC, id);

-- 共有先が一つでも残る間は反応を保つ。どのグループで見ても同じ記録の反応になる。
CREATE OR REPLACE FUNCTION public.gotore_prune_workout_stamps() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'gotore_workout_shares' THEN
    DELETE FROM public.gotore_workout_stamps r
    WHERE r.workout_id = OLD.workout_id
      AND NOT EXISTS (
        SELECT 1 FROM public.gotore_workouts w
        WHERE w.id = r.workout_id
          AND (w.group_id IS NOT NULL OR EXISTS (
            SELECT 1 FROM public.gotore_workout_shares s WHERE s.workout_id = w.id
          ))
      );
  ELSE
    DELETE FROM public.gotore_workout_stamps r
    WHERE r.workout_id = NEW.id
      AND NOT (
        EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.exercises) e
          WHERE jsonb_array_length(e->'sets') > 0)
        AND (NEW.group_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM public.gotore_workout_shares s WHERE s.workout_id = NEW.id
        ))
      );
  END IF;
  RETURN NULL;
END $$;
