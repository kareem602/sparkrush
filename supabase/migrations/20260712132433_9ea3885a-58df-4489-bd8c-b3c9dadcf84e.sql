
-- Owner auto-grant + moderation additions

-- 1. Profile moderation fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

-- 2. Reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('user','post','comment','message')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolver_id uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users create reports" ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reporter sees own" ON public.reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
CREATE POLICY "staff sees all reports" ON public.reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "staff updates reports" ON public.reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- 3. Announcements (broadcast notifications)
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "everyone reads announcements" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff creates announcements" ON public.announcements FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "owner deletes announcements" ON public.announcements FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

-- Fan-out announcement to notifications
CREATE OR REPLACE FUNCTION public.broadcast_announcement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (recipient_id, actor_id, type, body)
  SELECT p.id, NEW.author_id, 'announcement', NEW.title || ': ' || NEW.body
  FROM profiles p
  WHERE p.id <> NEW.author_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_announcement_created ON public.announcements;
CREATE TRIGGER on_announcement_created AFTER INSERT ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.broadcast_announcement();

-- 4. Staff moderation policies on content tables
DROP POLICY IF EXISTS "staff deletes posts" ON public.posts;
CREATE POLICY "staff deletes posts" ON public.posts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

DROP POLICY IF EXISTS "staff updates posts" ON public.posts;
CREATE POLICY "staff updates posts" ON public.posts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

DROP POLICY IF EXISTS "staff deletes comments" ON public.post_comments;
CREATE POLICY "staff deletes comments" ON public.post_comments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

DROP POLICY IF EXISTS "staff deletes messages" ON public.messages;
CREATE POLICY "staff deletes messages" ON public.messages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

DROP POLICY IF EXISTS "staff updates profiles" ON public.profiles;
CREATE POLICY "staff updates profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- Owner-only role management via user_roles
DROP POLICY IF EXISTS "owner manages roles" ON public.user_roles;
CREATE POLICY "owner manages roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

-- 5. Auto-grant owner role for designated email
CREATE OR REPLACE FUNCTION public.grant_owner_if_designated()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) = 'babatundekareem664@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_owner ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_owner
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.grant_owner_if_designated();

DROP TRIGGER IF EXISTS on_auth_user_updated_grant_owner ON auth.users;
CREATE TRIGGER on_auth_user_updated_grant_owner
AFTER UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION public.grant_owner_if_designated();

-- Backfill for existing user with that email
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner' FROM auth.users WHERE lower(email) = 'babatundekareem664@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE lower(email) = 'babatundekareem664@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
