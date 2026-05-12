
CREATE TYPE public.notification_type AS ENUM (
  'message', 'match', 'post_like', 'comment', 'story_view'
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL,
  actor_id UUID,
  type public.notification_type NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  match_id UUID,
  post_id UUID,
  story_id UUID,
  message_id UUID,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications(recipient_id) WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());
CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());
CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Helper: profile display name
CREATE OR REPLACE FUNCTION public._actor_name(_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(display_name, ''), 'Someone') FROM profiles WHERE id = _id
$$;

-- MESSAGES → notify recipient
CREATE OR REPLACE FUNCTION public.notify_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recipient uuid; m RECORD; preview text;
BEGIN
  SELECT user1_id, user2_id INTO m FROM matches WHERE id = NEW.match_id;
  recipient := CASE WHEN m.user1_id = NEW.sender_id THEN m.user2_id ELSE m.user1_id END;
  preview := substring(NEW.content from 1 for 80);
  INSERT INTO notifications(recipient_id, actor_id, type, body, match_id, message_id)
  VALUES (recipient, NEW.sender_id, 'message',
          public._actor_name(NEW.sender_id) || ': ' || preview,
          NEW.match_id, NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_message();

-- MATCHES → notify both users
CREATE OR REPLACE FUNCTION public.notify_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications(recipient_id, actor_id, type, body, match_id)
  VALUES
    (NEW.user1_id, NEW.user2_id, 'match',
     'You matched with ' || public._actor_name(NEW.user2_id) || '!', NEW.id),
    (NEW.user2_id, NEW.user1_id, 'match',
     'You matched with ' || public._actor_name(NEW.user1_id) || '!', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_match AFTER INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.notify_match();

-- POST LIKES → notify post author
CREATE OR REPLACE FUNCTION public.notify_post_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE author uuid;
BEGIN
  SELECT author_id INTO author FROM posts WHERE id = NEW.post_id;
  IF author IS NULL OR author = NEW.user_id THEN RETURN NEW; END IF;
  INSERT INTO notifications(recipient_id, actor_id, type, body, post_id)
  VALUES (author, NEW.user_id, 'post_like',
          public._actor_name(NEW.user_id) || ' liked your post', NEW.post_id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_post_like AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_post_like();

-- COMMENTS → notify post author
CREATE OR REPLACE FUNCTION public.notify_post_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE author uuid;
BEGIN
  SELECT author_id INTO author FROM posts WHERE id = NEW.post_id;
  IF author IS NULL OR author = NEW.author_id THEN RETURN NEW; END IF;
  INSERT INTO notifications(recipient_id, actor_id, type, body, post_id)
  VALUES (author, NEW.author_id, 'comment',
          public._actor_name(NEW.author_id) || ' commented: ' || substring(NEW.body from 1 for 80),
          NEW.post_id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_post_comment AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_post_comment();

-- STORY VIEWS → notify story owner
CREATE OR REPLACE FUNCTION public.notify_story_view()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE author uuid;
BEGIN
  SELECT author_id INTO author FROM stories WHERE id = NEW.story_id;
  IF author IS NULL OR author = NEW.viewer_id THEN RETURN NEW; END IF;
  INSERT INTO notifications(recipient_id, actor_id, type, body, story_id)
  VALUES (author, NEW.viewer_id, 'story_view',
          public._actor_name(NEW.viewer_id) || ' viewed your story', NEW.story_id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_story_view AFTER INSERT ON public.story_views
  FOR EACH ROW EXECUTE FUNCTION public.notify_story_view();
