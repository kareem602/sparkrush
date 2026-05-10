ALTER TABLE public.profiles ADD COLUMN boost_until TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN read_at TIMESTAMPTZ;

CREATE INDEX idx_profiles_boost ON public.profiles(boost_until) WHERE boost_until IS NOT NULL;
CREATE INDEX idx_messages_match_created ON public.messages(match_id, created_at);

-- Allow recipients to mark messages as read in their own matches (only the read_at field)
CREATE POLICY "Recipients mark messages read" ON public.messages FOR UPDATE TO authenticated
  USING (
    sender_id <> auth.uid() AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = messages.match_id AND (m.user1_id = auth.uid() OR m.user2_id = auth.uid())
    )
  );

-- Helper: check active VIP
CREATE OR REPLACE FUNCTION public.is_vip(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND status = 'active'
      AND plan <> 'free'
      AND (current_period_end IS NULL OR current_period_end > now())
  )
$$;