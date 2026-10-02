ALTER TABLE public.gotore_workouts
  ADD COLUMN last_activity_at timestamptz,
  ADD COLUMN auto_ended boolean NOT NULL DEFAULT false;

-- 既存の進行中記録には適用時点から１時間の猶予を与える。
UPDATE public.gotore_workouts
SET last_activity_at = clock_timestamp()
WHERE started_at IS NOT NULL AND ended_at IS NULL;
UPDATE public.gotore_workouts
SET last_activity_at = ended_at
WHERE started_at IS NOT NULL AND ended_at IS NOT NULL;

ALTER TABLE public.gotore_workouts ADD CONSTRAINT gotore_auto_finish_activity_check CHECK (
  (started_at IS NULL AND last_activity_at IS NULL AND NOT auto_ended)
  OR (started_at IS NOT NULL AND last_activity_at IS NOT NULL
      AND last_activity_at >= started_at
      AND (NOT auto_ended OR ended_at IS NOT NULL))
);

CREATE INDEX gotore_inactive_sessions
  ON public.gotore_workouts(last_activity_at)
  WHERE started_at IS NOT NULL AND ended_at IS NULL;

CREATE FUNCTION public.gotore_expire_inactive_sessions(target_user_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  expired_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.gotore_workouts
    SET ended_at = greatest(started_at, last_activity_at), auto_ended = true
    WHERE started_at IS NOT NULL AND ended_at IS NULL
      AND (target_user_id IS NULL OR user_id = target_user_id)
      AND last_activity_at <= clock_timestamp() - interval '1 hour'
    RETURNING id
  ) SELECT count(*) INTO expired_count FROM expired;
  RETURN expired_count;
END;
$$;
REVOKE ALL ON FUNCTION public.gotore_expire_inactive_sessions(uuid) FROM PUBLIC;

-- SupabaseではDB内で実行する。通常のPostgreSQLテスト環境に拡張がない場合は
-- 関数を直接実行して検証する。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     AND current_database() = current_setting('cron.database_name', true) THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.schedule(
      'gotore-auto-finish-sessions',
      '* * * * *',
      'SELECT public.gotore_expire_inactive_sessions()'
    );
  END IF;
END;
$$;
