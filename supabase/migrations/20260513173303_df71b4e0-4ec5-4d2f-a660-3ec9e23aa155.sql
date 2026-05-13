-- 1. Message media kind enum
DO $$ BEGIN
  CREATE TYPE public.message_kind AS ENUM ('text','image','video','audio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend messages table
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS kind public.message_kind NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

-- Allow content to be empty when sending media
ALTER TABLE public.messages ALTER COLUMN content SET DEFAULT '';

-- 3. Smarter preview for notifications (handles media types)
CREATE OR REPLACE FUNCTION public.notify_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE recipient uuid; m RECORD; preview text; actor text;
BEGIN
  SELECT user1_id, user2_id INTO m FROM matches WHERE id = NEW.match_id;
  recipient := CASE WHEN m.user1_id = NEW.sender_id THEN m.user2_id ELSE m.user1_id END;
  actor := public._actor_name(NEW.sender_id);
  preview := CASE NEW.kind
    WHEN 'image' THEN '🖼️ Photo'
    WHEN 'video' THEN '🎬 Video'
    WHEN 'audio' THEN '🎤 Voice note'
    ELSE substring(COALESCE(NEW.content,'') from 1 for 80)
  END;
  INSERT INTO notifications(recipient_id, actor_id, type, body, match_id, message_id)
  VALUES (recipient, NEW.sender_id, 'message', actor || ': ' || preview, NEW.match_id, NEW.id);
  RETURN NEW;
END $function$;

-- 4. Storage policies for chat media in the public 'media' bucket
-- Path convention: chat-media/{matchId}/{senderId}/{file}
DROP POLICY IF EXISTS "Matched users upload chat media" ON storage.objects;
CREATE POLICY "Matched users upload chat media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = 'chat-media'
  AND (storage.foldername(name))[3] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.matches mm
    WHERE mm.id::text = (storage.foldername(name))[2]
      AND (mm.user1_id = auth.uid() OR mm.user2_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Senders manage own chat media" ON storage.objects;
CREATE POLICY "Senders manage own chat media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = 'chat-media'
  AND (storage.foldername(name))[3] = auth.uid()::text
);
