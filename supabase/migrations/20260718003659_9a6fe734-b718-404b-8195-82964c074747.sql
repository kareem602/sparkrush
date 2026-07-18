
CREATE OR REPLACE FUNCTION public.grant_owner_if_designated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF lower(NEW.email) = 'kareembabatunde71@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END $function$;

-- Grant roles to the new owner if they already signed up
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::app_role FROM auth.users WHERE lower(email) = 'kareembabatunde71@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE lower(email) = 'kareembabatunde71@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Revoke roles from the previous designated email
DELETE FROM public.user_roles
WHERE role IN ('owner','admin')
  AND user_id IN (SELECT id FROM auth.users WHERE lower(email) = 'babatundekareem664@gmail.com');
