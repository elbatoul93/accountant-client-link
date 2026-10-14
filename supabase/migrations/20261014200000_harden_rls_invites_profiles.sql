-- Security hardening from the launch audit.

-- 1) Profiles: users (and linked accountants) may not change role or accountant link.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- auth.uid() is null for service role / cascades from auth.users deletes
  IF auth.uid() IS NOT NULL AND (
    NEW.user_type IS DISTINCT FROM OLD.user_type
    OR NEW.linked_accountant_id IS DISTINCT FROM OLD.linked_accountant_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
  ) THEN
    RAISE EXCEPTION 'user_type and linked_accountant_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_privileged ON public.profiles;
CREATE TRIGGER profiles_protect_privileged
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2) Invitations: no more public listing. Validate a token through an RPC instead.
DROP POLICY IF EXISTS "Anyone can view invitations by token" ON public.invitations;

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token text)
RETURNS TABLE (
  is_valid boolean,
  email text,
  prefill_name text,
  prefill_company text,
  accountant_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true, i.email, i.prefill_name, i.prefill_company,
         COALESCE(NULLIF(p.company, ''), p.name)
  FROM public.invitations i
  LEFT JOIN public.profiles p ON p.user_id = i.accountant_id
  WHERE i.token = _token
    AND i.used = false AND i.is_used = false
    AND i.expires_at > now()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_invitation_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon, authenticated;

-- 3) handle_new_user: enforce the invited email address.
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
        AND (email IS NULL OR lower(email) = lower(NEW.email))
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

-- 4) Accountants may only target their own linked clients.
DROP POLICY IF EXISTS "Accountant insert own g50" ON public.g50_declarations;
CREATE POLICY "Accountant insert own g50"
  ON public.g50_declarations FOR INSERT
  WITH CHECK (auth.uid() = accountant_id AND public.is_linked_accountant(client_id));

DROP POLICY IF EXISTS "Accountant update own g50" ON public.g50_declarations;
CREATE POLICY "Accountant update own g50"
  ON public.g50_declarations FOR UPDATE
  USING (auth.uid() = accountant_id)
  WITH CHECK (auth.uid() = accountant_id AND public.is_linked_accountant(client_id));

DROP POLICY IF EXISTS "Accountant manage own shared_documents" ON public.shared_documents;
CREATE POLICY "Accountant manage own shared_documents"
  ON public.shared_documents FOR ALL TO authenticated
  USING (auth.uid() = accountant_id)
  WITH CHECK (auth.uid() = accountant_id AND public.is_linked_accountant(client_id));

DROP POLICY IF EXISTS "Accountant insert own shared" ON public.acc_shared_documents;
CREATE POLICY "Accountant insert own shared"
  ON public.acc_shared_documents FOR INSERT
  WITH CHECK (
    auth.uid() = accountant_id
    AND (client_user_id IS NULL OR public.is_linked_accountant(client_user_id))
  );

-- 5) Messages: only between a linked accountant and client.
DROP POLICY IF EXISTS "Users can send messages as themselves" ON public.messages;
CREATE POLICY "Users can send messages as themselves"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      public.is_linked_accountant(receiver_id)
      OR receiver_id = public.get_my_linked_accountant_id()
    )
  );

-- Receiver may only flip is_read.
CREATE OR REPLACE FUNCTION public.protect_message_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NEW.content IS DISTINCT FROM OLD.content
    OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Only is_read can be updated on a message';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_protect_content ON public.messages;
CREATE TRIGGER messages_protect_content
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_message_content();

-- 6) Clients may only sign shared documents, not rewrite them.
CREATE OR REPLACE FUNCTION public.protect_shared_document_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> OLD.accountant_id THEN
    IF to_jsonb(NEW) - ARRAY['signed_at','signed_by','signature_data_url','workflow','updated_at']
       IS DISTINCT FROM
       to_jsonb(OLD) - ARRAY['signed_at','signed_by','signature_data_url','workflow','updated_at'] THEN
      RAISE EXCEPTION 'Clients can only update signature fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS acc_shared_protect_fields ON public.acc_shared_documents;
CREATE TRIGGER acc_shared_protect_fields
  BEFORE UPDATE ON public.acc_shared_documents
  FOR EACH ROW EXECUTE FUNCTION public.protect_shared_document_fields();

NOTIFY pgrst, 'reload schema';
