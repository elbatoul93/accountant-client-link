
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS prefill_name text,
  ADD COLUMN IF NOT EXISTS prefill_company text,
  ADD COLUMN IF NOT EXISTS prefill_commune text,
  ADD COLUMN IF NOT EXISTS prefill_direction text,
  ADD COLUMN IF NOT EXISTS prefill_bp text;

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
  _name text;
  _company text;
  _commune text;
  _direction text;
  _bp text;
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

      _name := COALESCE(NULLIF(_invite.prefill_name, ''), NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
      _company := COALESCE(NULLIF(_invite.prefill_company, ''), NEW.raw_user_meta_data->>'company');
      _commune := NULLIF(_invite.prefill_commune, '');
      _direction := NULLIF(_invite.prefill_direction, '');
      _bp := NULLIF(_invite.prefill_bp, '');
    ELSE
      RAISE EXCEPTION 'Invite Link Expired';
    END IF;
  ELSE
    _role := 'accountant';
    _linked := NULL;
    _name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
    _company := NEW.raw_user_meta_data->>'company';
    _commune := NULL;
    _direction := NULL;
    _bp := NULL;
  END IF;

  INSERT INTO public.profiles (user_id, name, email, company, user_type, linked_accountant_id, commune, direction, bp)
  VALUES (NEW.id, _name, NEW.email, _company, _role, _linked, _commune, _direction, _bp);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  RETURN NEW;
END;
$function$;
