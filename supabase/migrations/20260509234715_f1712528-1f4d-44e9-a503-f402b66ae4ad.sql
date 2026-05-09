-- Enums
CREATE TYPE public.gender AS ENUM ('male', 'female', 'nonbinary', 'other');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  age INT,
  gender public.gender,
  interested_in public.gender,
  photo_url TEXT,
  location TEXT,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by authenticated"
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users insert own profile"
ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile"
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Swipes
CREATE TABLE public.swipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  swiped_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  liked BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(swiper_id, swiped_id),
  CHECK (swiper_id <> swiped_id)
);

ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own swipes"
ON public.swipes FOR SELECT TO authenticated USING (auth.uid() = swiper_id);

CREATE POLICY "Users insert own swipes"
ON public.swipes FOR INSERT TO authenticated WITH CHECK (auth.uid() = swiper_id);

-- Matches
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user1_id, user2_id),
  CHECK (user1_id < user2_id)
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own matches"
ON public.matches FOR SELECT TO authenticated
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Auto-create match on mutual like
CREATE OR REPLACE FUNCTION public.handle_swipe()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  reciprocal BOOLEAN;
  u1 UUID; u2 UUID;
BEGIN
  IF NEW.liked = false THEN RETURN NEW; END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.swipes
    WHERE swiper_id = NEW.swiped_id AND swiped_id = NEW.swiper_id AND liked = true
  ) INTO reciprocal;
  IF reciprocal THEN
    u1 := LEAST(NEW.swiper_id, NEW.swiped_id);
    u2 := GREATEST(NEW.swiper_id, NEW.swiped_id);
    INSERT INTO public.matches (user1_id, user2_id) VALUES (u1, u2)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_swipe_created
AFTER INSERT ON public.swipes
FOR EACH ROW EXECUTE FUNCTION public.handle_swipe();

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_match_idx ON public.messages(match_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view messages in their matches"
ON public.messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.matches m
  WHERE m.id = match_id AND (m.user1_id = auth.uid() OR m.user2_id = auth.uid())
));

CREATE POLICY "Users send messages in their matches"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_id AND (m.user1_id = auth.uid() OR m.user2_id = auth.uid())
  )
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.matches REPLICA IDENTITY FULL;