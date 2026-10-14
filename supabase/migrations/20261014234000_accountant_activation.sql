-- Accountant activation gate. Decided by default (recommendation, Mo can override):
-- self-registered accountants start 'pending' and cannot read or write business data until an
-- admin activates them. Existing accountants and all clients stay 'active'.

-- 1) Status on profiles. The default 'active' keeps every existing row (and every client) active.
ALTER TABLE public.profiles
  ADD COLUMN account_status text NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('pending','active','suspended'));
CREATE INDEX idx_profiles_account_status ON public.profiles (account_status) WHERE account_status <> 'active';

-- 2) Admins: a plain table with no policies, readable only through is_admin().
CREATE TABLE public.admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admins FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_active_accountant()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.user_type = 'accountant' AND p.account_status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.is_active_accountant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_accountant() TO authenticated;

-- 3) New self-registered accountants start pending.
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
  _status text := 'active';
  _name text;
  _company text;
  _commune text;
  _direction text;
  _bp text;
BEGIN
  _invite_token := left(NEW.raw_user_meta_data->>'invite_token', 128);

  IF _invite_token IS NOT NULL AND length(_invite_token) > 0 THEN
    SELECT * INTO _invite
      FROM public.invitations
      WHERE token = _invite_token
        AND used = false
        AND is_used = false
        AND expires_at > now()
        AND (email IS NULL OR lower(email) = lower(NEW.email))
      LIMIT 1
      FOR UPDATE;

    IF FOUND THEN
      _role := 'client';
      _linked := _invite.accountant_id;
      UPDATE public.invitations
        SET used = true, is_used = true, used_by = NEW.id, used_at = now()
        WHERE id = _invite.id;
      _name := COALESCE(NULLIF(_invite.prefill_name, ''), left(NEW.raw_user_meta_data->>'name', 200), split_part(NEW.email, '@', 1));
      _company := COALESCE(NULLIF(_invite.prefill_company, ''), left(NEW.raw_user_meta_data->>'company', 200));
      _commune := NULLIF(_invite.prefill_commune, '');
      _direction := NULLIF(_invite.prefill_direction, '');
      _bp := NULLIF(_invite.prefill_bp, '');
    ELSE
      RAISE EXCEPTION 'Invite Link Expired';
    END IF;
  ELSE
    _role := 'accountant';
    _linked := NULL;
    _status := 'pending';
    _name := COALESCE(left(NEW.raw_user_meta_data->>'name', 200), split_part(NEW.email, '@', 1));
    _company := left(NEW.raw_user_meta_data->>'company', 200);
    _commune := NULL;
    _direction := NULL;
    _bp := NULL;
  END IF;

  INSERT INTO public.profiles (user_id, name, email, company, user_type, linked_accountant_id, commune, direction, bp, account_status)
  VALUES (NEW.id, _name, NEW.email, _company, _role, _linked, _commune, _direction, _bp, _status);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  RETURN NEW;
END;
$function$;

-- 4) Nobody but the activation function may change account_status.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.user_type IS DISTINCT FROM OLD.user_type
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR (NEW.linked_accountant_id IS DISTINCT FROM OLD.linked_accountant_id
           AND coalesce(current_setting('app.allow_unlink', true), '') <> 'on') THEN
      RAISE EXCEPTION 'user_type and linked_accountant_id cannot be changed';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email
       AND coalesce(current_setting('app.allow_email_sync', true), '') <> 'on' THEN
      RAISE EXCEPTION 'email cannot be changed here';
    END IF;
    IF NEW.account_status IS DISTINCT FROM OLD.account_status
       AND coalesce(current_setting('app.allow_status_change', true), '') <> 'on' THEN
      RAISE EXCEPTION 'account_status cannot be changed here';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5) Admin API: list accountants and set their status.
CREATE OR REPLACE FUNCTION public.admin_list_accountants()
RETURNS TABLE (user_id uuid, name text, email text, company text, account_status text, created_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN QUERY
    SELECT p.user_id, p.name, p.email, p.company, p.account_status, p.created_at
    FROM public.profiles p
    WHERE p.user_type = 'accountant'
    ORDER BY (p.account_status = 'pending') DESC, p.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_accountants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_accountants() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_accountant_status(_user_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF _status NOT IN ('pending','active','suspended') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  PERFORM set_config('app.allow_status_change', 'on', true);
  UPDATE public.profiles SET account_status = _status
    WHERE user_id = _user_id AND user_type = 'accountant';
  PERFORM set_config('app.allow_status_change', 'off', true);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accountant not found';
  END IF;
  INSERT INTO public.audit_log (actor_id, accountant_id, action, entity, entity_id, detail)
  VALUES (auth.uid(), _user_id, 'accountant.status', 'profiles', _user_id::text, jsonb_build_object('status', _status));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_accountant_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_accountant_status(uuid, text) TO authenticated;

-- 6) Restrictive policies: when the row belongs to the acting accountant, they must be active.
--    Clients (accountant_id <> their uid) are unaffected; their own permissive policies decide.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'acc_invoices','acc_declarations','acc_financial_statements','acc_shared_documents','acc_legal_documents',
    'g50_declarations','shared_documents','invitations',
    'acc_clients','acc_employees','acc_bills','acc_journal_lines','acc_period_locks','acc_tva_precompte',
    'acc_assets','acc_checklist','acc_reminders_sent','acc_payroll_runs','acc_payslips'] LOOP
    EXECUTE format($p$CREATE POLICY "Accountant must be active" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING (accountant_id IS DISTINCT FROM auth.uid() OR public.is_active_accountant())
      WITH CHECK (accountant_id IS DISTINCT FROM auth.uid() OR public.is_active_accountant())$p$, t);
  END LOOP;
END $$;

-- Storage folders owned by accountants.
DROP POLICY IF EXISTS "Accountant manage own shared files" ON storage.objects;
CREATE POLICY "Accountant manage own shared files" ON storage.objects
  FOR ALL TO authenticated USING (
    bucket_id = 'client-uploads'
    AND (storage.foldername(name))[1] IN ('accountant-shared','accountant-legal')
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.is_active_accountant()
  ) WITH CHECK (
    bucket_id = 'client-uploads'
    AND (storage.foldername(name))[1] IN ('accountant-shared','accountant-legal')
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.is_active_accountant()
  );

NOTIFY pgrst, 'reload schema';
