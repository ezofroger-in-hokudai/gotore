-- 自己登録だけをGoogleに限定する。利用者が編集できるuser_metadataは判定に使わない。
CREATE OR REPLACE FUNCTION public.gotore_before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN event->'user'->'app_metadata'->>'provider' = 'google'
    THEN '{}'::jsonb
    ELSE jsonb_build_object('error', jsonb_build_object(
      'http_code', 403, 'message', '新規登録にはGoogleで続けるを利用してください。'
    ))
  END;
$$;

REVOKE ALL ON FUNCTION public.gotore_before_user_created(jsonb) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.gotore_before_user_created(jsonb) TO supabase_auth_admin;
