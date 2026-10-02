-- 受信イベントと配信を分離し、OS表示後もアプリ内の未表示分を残す。
CREATE TABLE public.gotore_notification_settings (
 user_id uuid PRIMARY KEY REFERENCES public.gotore_profiles(id) ON DELETE CASCADE,
 stamp_enabled boolean NOT NULL DEFAULT true,
 start_enabled boolean NOT NULL DEFAULT true,
 start_timing text NOT NULL DEFAULT 'home' CHECK(start_timing IN ('home','now','set')),
 vibration boolean NOT NULL DEFAULT true,
 sound boolean NOT NULL DEFAULT false,
 push_stamp boolean NOT NULL DEFAULT true,
 push_start boolean NOT NULL DEFAULT true
);
CREATE TABLE public.gotore_push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.gotore_profiles(id) ON DELETE CASCADE,
 endpoint text NOT NULL UNIQUE,
 keys jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_active_at timestamptz
);
CREATE TABLE public.gotore_notification_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_id uuid NOT NULL REFERENCES public.gotore_profiles(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES public.gotore_profiles(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('stamp','start')),
 workout_id uuid NOT NULL REFERENCES public.gotore_workouts(id) ON DELETE CASCADE,
 stamp_id uuid REFERENCES public.gotore_workout_stamps(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 seen_at timestamptz,
 UNIQUE(recipient_id,stamp_id)
);
CREATE UNIQUE INDEX gotore_notification_start_unique ON public.gotore_notification_events(recipient_id,workout_id) WHERE kind='start';
CREATE INDEX gotore_notification_pending ON public.gotore_notification_events(recipient_id,created_at,id) WHERE seen_at IS NULL;
CREATE TABLE public.gotore_push_deliveries (
 event_id uuid NOT NULL REFERENCES public.gotore_notification_events(id) ON DELETE CASCADE,
 subscription_id uuid NOT NULL REFERENCES public.gotore_push_subscriptions(id) ON DELETE CASCADE,
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 delivered_at timestamptz,
 PRIMARY KEY(event_id,subscription_id)
);
CREATE INDEX gotore_push_pending ON public.gotore_push_deliveries(next_attempt_at) WHERE delivered_at IS NULL;
ALTER TABLE public.gotore_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gotore_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_notification_settings,public.gotore_push_subscriptions,public.gotore_notification_events,public.gotore_push_deliveries FROM anon,authenticated;
CREATE FUNCTION public.gotore_enqueue_push() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO public.gotore_push_deliveries(event_id,subscription_id)
 SELECT NEW.id,s.id FROM public.gotore_push_subscriptions s WHERE s.user_id=NEW.recipient_id;
 RETURN NEW;
END $$;
CREATE TRIGGER gotore_enqueue_push AFTER INSERT ON public.gotore_notification_events FOR EACH ROW EXECUTE FUNCTION public.gotore_enqueue_push();
CREATE FUNCTION public.gotore_notify_stamp() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.sender_id <> NEW.recipient_id THEN
 INSERT INTO public.gotore_notification_events(recipient_id,sender_id,kind,workout_id,stamp_id,created_at)
 VALUES(NEW.recipient_id,NEW.sender_id,'stamp',NEW.workout_id,NEW.id,NEW.created_at) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gotore_notify_stamp AFTER INSERT ON public.gotore_workout_stamps FOR EACH ROW EXECUTE FUNCTION public.gotore_notify_stamp();
CREATE FUNCTION public.gotore_notify_start() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO public.gotore_notification_events(recipient_id,sender_id,kind,workout_id)
 SELECT m.user_id,NEW.user_id,'start',NEW.workout_id
 FROM public.gotore_group_members m JOIN public.gotore_workouts w ON w.id=NEW.workout_id
 WHERE m.group_id=NEW.group_id AND m.user_id<>NEW.user_id
 AND w.started_at IS NOT NULL AND w.ended_at IS NULL
 AND w.started_at>clock_timestamp()-interval '10 seconds'
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER gotore_notify_start AFTER INSERT ON public.gotore_workout_shares FOR EACH ROW EXECUTE FUNCTION public.gotore_notify_start();
-- 既存の未表示スタンプも、配信履歴ではなくアプリ内の受信対象として移す。
INSERT INTO public.gotore_notification_events(recipient_id,sender_id,kind,workout_id,stamp_id,created_at)
SELECT recipient_id,sender_id,'stamp',workout_id,id,created_at FROM public.gotore_workout_stamps
WHERE announced_at IS NULL AND sender_id<>recipient_id ON CONFLICT DO NOTHING;
