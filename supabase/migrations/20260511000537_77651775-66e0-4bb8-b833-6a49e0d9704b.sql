
-- enums
CREATE TYPE public.verification_status AS ENUM ('unverified','pending','verified','premium');
CREATE TYPE public.message_policy AS ENUM ('everyone','matches');
CREATE TYPE public.verification_request_status AS ENUM ('pending','approved','rejected');

-- profiles additions
ALTER TABLE public.profiles
  ADD COLUMN interests text[] NOT NULL DEFAULT '{}',
  ADD COLUMN hide_age boolean NOT NULL DEFAULT false,
  ADD COLUMN hide_location boolean NOT NULL DEFAULT false,
  ADD COLUMN message_policy public.message_policy NOT NULL DEFAULT 'matches',
  ADD COLUMN verification_status public.verification_status NOT NULL DEFAULT 'unverified',
  ADD COLUMN verification_selfie_url text;

CREATE INDEX idx_profiles_display_name_lower ON public.profiles (lower(display_name));
CREATE INDEX idx_profiles_verification_status ON public.profiles (verification_status);

-- verification requests
CREATE TABLE public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  selfie_url text NOT NULL,
  status public.verification_request_status NOT NULL DEFAULT 'pending',
  notes text,
  reviewer_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own verification requests"
ON public.verification_requests FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users insert own verification requests"
ON public.verification_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins update verification requests"
ON public.verification_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_verification_requests_touch
BEFORE UPDATE ON public.verification_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- when a request is approved, mark profile verified
CREATE OR REPLACE FUNCTION public.apply_verification_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    UPDATE public.profiles
       SET verification_status = 'verified',
           verification_selfie_url = NEW.selfie_url
     WHERE id = NEW.user_id;
  ELSIF NEW.status = 'rejected' AND OLD.status <> 'rejected' THEN
    UPDATE public.profiles
       SET verification_status = 'unverified'
     WHERE id = NEW.user_id AND verification_status = 'pending';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_apply_verification_decision
AFTER UPDATE ON public.verification_requests
FOR EACH ROW EXECUTE FUNCTION public.apply_verification_decision();

-- buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('verification','verification', false),
  ('media','media', true)
ON CONFLICT (id) DO NOTHING;

-- verification bucket policies (path: {user_id}/...)
CREATE POLICY "Users upload own selfie"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'verification' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own selfie"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'verification' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "Users update own selfie"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'verification' AND auth.uid()::text = (storage.foldername(name))[1]);

-- media bucket policies (public read, user-scoped write)
CREATE POLICY "Public read media"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'media');

CREATE POLICY "Users upload own media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
