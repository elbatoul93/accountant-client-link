-- Add is_used column mirroring 'used' for clearer naming, then keep both in sync
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS is_used boolean NOT NULL DEFAULT false;

UPDATE public.invitations SET is_used = used WHERE is_used IS DISTINCT FROM used;

-- Replace handle_new_user to check is_used and update both columns
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _invite_token text;
  _invite RECORD;
  _role public.app_role;
  _linked uuid;
BEGIN
  _invite_token := NEW.raw_user_meta_data->>'invite_token';

  IF _invite_token IS NOT NULL AND length(_invite_token) > 0 THEN
    SELECT * INTO _invite
      FROM public.invitations
      WHERE token = _invite_token
        AND used = false
        AND is_used = false
        AND expires_at > now()
      LIMIT 1;

    IF FOUND THEN
      _role := 'client';
      _linked := _invite.accountant_id;

      UPDATE public.invitations
        SET used = true, is_used = true, used_by = NEW.id, used_at = now()
        WHERE id = _invite.id;
    ELSE
      RAISE EXCEPTION 'Invite Link Expired';
    END IF;
  ELSE
    _role := 'accountant';
    _linked := NULL;
  END IF;

  INSERT INTO public.profiles (user_id, name, email, company, user_type, linked_accountant_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'company',
    _role,
    _linked
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  RETURN NEW;
END;
$function$;