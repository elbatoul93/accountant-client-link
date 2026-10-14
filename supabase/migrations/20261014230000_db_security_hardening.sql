-- Deep audit (database and security), see deep-audit/database-security.md.
-- Findings SEC-1 .. SEC-12. Never edit merged migrations; this one builds on 20261014220000.

-- SEC-1: invite consumption was racy (two signups could consume one token) and
-- metadata was unbounded. Lock the invitation row and cap text lengths.
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
    _name := COALESCE(left(NEW.raw_user_meta_data->>'name', 200), split_part(NEW.email, '@', 1));
    _company := left(NEW.raw_user_meta_data->>'company', 200);
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

-- SEC-2: function execute grants. has_role let anonymous callers probe the role of any user id;
-- get_my_linked_accountant_id was executable by PUBLIC. Trigger functions are not RPC-callable.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_linked_accountant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_linked_accountant_id() TO authenticated;

-- SEC-3: profiles.email is the identity used by can_address_email and invitation checks.
-- It must follow auth.users and not be editable by users or accountants.
-- Also lets a legitimate unlink (unlink_client below) change linked_accountant_id.
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
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.allow_email_sync', 'on', true);
  UPDATE public.profiles SET email = NEW.email WHERE user_id = NEW.id AND email IS DISTINCT FROM NEW.email;
  PERFORM set_config('app.allow_email_sync', 'off', true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_profile_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();

-- SEC-4: offboarding. Neither side could ever unlink a client (the trigger above blocks it).
-- unlink_client() is defined below, after audit_log exists.

-- SEC-5: signature integrity on acc_shared_documents.
-- Accountants can never write signature fields; the addressee signs once, the timestamp is
-- server-side; a signed document's content is frozen for everyone.
CREATE OR REPLACE FUNCTION public.protect_shared_document_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _volatile text[] := ARRAY['signed_at','signed_by','signature_data_url','workflow','updated_at'];
BEGIN
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.signed_at := NULL;
    NEW.signed_by := NULL;
    NEW.signature_data_url := NULL;
    RETURN NEW;
  END IF;

  IF _uid = OLD.accountant_id THEN
    -- Stale copies in the accountant's UI must not clobber a signature.
    NEW.signed_at := OLD.signed_at;
    NEW.signed_by := OLD.signed_by;
    NEW.signature_data_url := OLD.signature_data_url;
    IF OLD.signed_at IS NOT NULL
       AND to_jsonb(NEW) - _volatile IS DISTINCT FROM to_jsonb(OLD) - _volatile THEN
      RAISE EXCEPTION 'A signed document cannot be modified';
    END IF;
  ELSE
    IF to_jsonb(NEW) - _volatile IS DISTINCT FROM to_jsonb(OLD) - _volatile THEN
      RAISE EXCEPTION 'Clients can only update signature fields';
    END IF;
    IF OLD.signed_at IS NOT NULL THEN
      NEW.signed_at := OLD.signed_at;
      NEW.signed_by := OLD.signed_by;
      NEW.signature_data_url := OLD.signature_data_url;
    ELSIF NEW.signed_at IS NOT NULL THEN
      NEW.signed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS acc_shared_protect_fields ON public.acc_shared_documents;
CREATE TRIGGER acc_shared_protect_fields
  BEFORE INSERT OR UPDATE ON public.acc_shared_documents
  FOR EACH ROW EXECUTE FUNCTION public.protect_shared_document_fields();

-- SEC-6: append-only audit trail for signatures, sent G50 and client unlinking.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  accountant_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  detail jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_accountant_idx ON public.audit_log (accountant_id, at DESC);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Accountant reads own audit log" ON public.audit_log;
CREATE POLICY "Accountant reads own audit log" ON public.audit_log
  FOR SELECT TO authenticated USING (accountant_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM anon, authenticated;
REVOKE ALL ON public.audit_log FROM anon;

CREATE OR REPLACE FUNCTION public.audit_signature_and_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'acc_shared_documents' THEN
    IF OLD.signed_at IS NULL AND NEW.signed_at IS NOT NULL THEN
      INSERT INTO public.audit_log (actor_id, accountant_id, action, entity, entity_id, detail)
      VALUES (auth.uid(), NEW.accountant_id, 'document.signed', TG_TABLE_NAME, NEW.id::text,
              jsonb_build_object('signed_by', NEW.signed_by, 'label', NEW.label, 'client_ref', NEW.client_ref));
    END IF;
  ELSIF TG_TABLE_NAME = 'g50_declarations' THEN
    IF OLD.sent = false AND NEW.sent = true THEN
      INSERT INTO public.audit_log (actor_id, accountant_id, action, entity, entity_id, detail)
      VALUES (auth.uid(), NEW.accountant_id, 'g50.sent', TG_TABLE_NAME, NEW.id::text,
              jsonb_build_object('client_id', NEW.client_id, 'month', NEW.month, 'year', NEW.year));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_signature_and_send() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS acc_shared_audit ON public.acc_shared_documents;
CREATE TRIGGER acc_shared_audit AFTER UPDATE ON public.acc_shared_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_signature_and_send();
DROP TRIGGER IF EXISTS g50_audit ON public.g50_declarations;
CREATE TRIGGER g50_audit AFTER UPDATE ON public.g50_declarations
  FOR EACH ROW EXECUTE FUNCTION public.audit_signature_and_send();

-- SEC-4: unlink_client (logs itself; the profiles trigger cannot know the accountant).
CREATE OR REPLACE FUNCTION public.unlink_client(_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_linked_accountant(_client_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  PERFORM set_config('app.allow_unlink', 'on', true);
  UPDATE public.profiles SET linked_accountant_id = NULL WHERE user_id = _client_id;
  PERFORM set_config('app.allow_unlink', 'off', true);
  INSERT INTO public.audit_log (actor_id, accountant_id, action, entity, entity_id)
  VALUES (auth.uid(), auth.uid(), 'client.unlinked', 'profiles', _client_id::text);
END;
$$;

-- SEC-7: G50 drafts must not be visible to the client before the accountant sends them.
DROP POLICY IF EXISTS "Client select own g50" ON public.g50_declarations;
CREATE POLICY "Client select own g50" ON public.g50_declarations
  FOR SELECT USING (auth.uid() = client_id AND sent = true);
DROP POLICY IF EXISTS "Accountant delete own g50" ON public.g50_declarations;
CREATE POLICY "Accountant delete own g50" ON public.g50_declarations
  FOR DELETE USING (auth.uid() = accountant_id AND sent = false);

-- SEC-8: referential integrity. NOT VALID: enforced for new and changed rows without
-- failing on orphans that may already exist in production.
ALTER TABLE public.documents ADD CONSTRAINT documents_user_fk
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_fk
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.messages ADD CONSTRAINT messages_receiver_fk
  FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.g50_declarations ADD CONSTRAINT g50_accountant_fk
  FOREIGN KEY (accountant_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.g50_declarations ADD CONSTRAINT g50_client_fk
  FOREIGN KEY (client_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.shared_documents ADD CONSTRAINT shared_documents_accountant_fk
  FOREIGN KEY (accountant_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.shared_documents ADD CONSTRAINT shared_documents_client_fk
  FOREIGN KEY (client_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.acc_invoices ADD CONSTRAINT acc_invoices_accountant_fk
  FOREIGN KEY (accountant_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.acc_declarations ADD CONSTRAINT acc_declarations_accountant_fk
  FOREIGN KEY (accountant_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.acc_financial_statements ADD CONSTRAINT acc_fs_accountant_fk
  FOREIGN KEY (accountant_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.acc_shared_documents ADD CONSTRAINT acc_shared_accountant_fk
  FOREIGN KEY (accountant_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.acc_shared_documents ADD CONSTRAINT acc_shared_client_user_fk
  FOREIGN KEY (client_user_id) REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.acc_legal_documents ADD CONSTRAINT acc_legal_accountant_fk
  FOREIGN KEY (accountant_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

-- SEC-9: input bounds (also NOT VALID).
ALTER TABLE public.messages ADD CONSTRAINT messages_content_len
  CHECK (char_length(content) BETWEEN 1 AND 5000) NOT VALID;
ALTER TABLE public.g50_declarations ADD CONSTRAINT g50_month_year
  CHECK (month BETWEEN 1 AND 12 AND year BETWEEN 2000 AND 2100) NOT VALID;
ALTER TABLE public.acc_shared_documents ADD CONSTRAINT acc_shared_signature_len
  CHECK (signature_data_url IS NULL OR char_length(signature_data_url) <= 700000) NOT VALID;
ALTER TABLE public.documents ADD CONSTRAINT documents_path_in_own_folder
  CHECK (file_path LIKE user_id::text || '/%') NOT VALID;
ALTER TABLE public.documents ADD CONSTRAINT documents_title_len
  CHECK (char_length(title) <= 300 AND coalesce(char_length(description), 0) <= 5000) NOT VALID;

-- SEC-10: indexes that the RLS policies and lookups actually use.
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles (lower(email));
CREATE INDEX IF NOT EXISTS idx_acc_shared_email_lower ON public.acc_shared_documents (lower(client_email));
CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread ON public.messages (receiver_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_g50_client_sent ON public.g50_declarations (client_id) WHERE sent = true;
DROP INDEX IF EXISTS public.idx_invitations_token; -- duplicate of the UNIQUE constraint index

-- SEC-11: storage limits. Private buckets had no size or type limits.
UPDATE storage.buckets SET file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv','text/plain'
  ] WHERE id = 'client-uploads';
UPDATE storage.buckets SET file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf'] WHERE id = 'shared-docs';

-- SEC-12: only accountants may write the accountant-owned storage folders.
DROP POLICY IF EXISTS "Accountant manage own shared files" ON storage.objects;
CREATE POLICY "Accountant manage own shared files" ON storage.objects
  FOR ALL TO authenticated USING (
    bucket_id = 'client-uploads'
    AND (storage.foldername(name))[1] IN ('accountant-shared','accountant-legal')
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.has_role(auth.uid(), 'accountant'::public.app_role)
  ) WITH CHECK (
    bucket_id = 'client-uploads'
    AND (storage.foldername(name))[1] IN ('accountant-shared','accountant-legal')
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.has_role(auth.uid(), 'accountant'::public.app_role)
  );

NOTIFY pgrst, 'reload schema';
