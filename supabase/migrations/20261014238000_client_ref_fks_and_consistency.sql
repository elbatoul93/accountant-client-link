-- SEC-15: tie the five document tables to acc_clients. NOT VALID so existing rows with an unknown client_ref do not
-- block the migration (run VALIDATE once they are clean); new and changed rows are checked. RESTRICT, not CASCADE:
-- deleting a client must not silently erase its invoices, declarations or signed documents (retention policy).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acc_invoices','acc_declarations','acc_financial_statements','acc_legal_documents','acc_shared_documents']
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (accountant_id, client_ref)', t || '_client_idx', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_client_fk') THEN
      EXECUTE format($f$ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (accountant_id, client_ref)
        REFERENCES public.acc_clients (accountant_id, client_ref) ON DELETE RESTRICT NOT VALID$f$, t, t || '_client_fk');
    END IF;
  END LOOP;
END $$;

-- SEC-17a: invitations.used and is_used stay equal whichever one a writer sets (the dashboard reads both).
CREATE OR REPLACE FUNCTION public.sync_invitation_used()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.used := NEW.used OR NEW.is_used;
  NEW.is_used := NEW.used;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS invitations_sync_used ON public.invitations;
CREATE TRIGGER invitations_sync_used BEFORE INSERT OR UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.sync_invitation_used();
UPDATE public.invitations SET used = true, is_used = true WHERE used <> is_used;

-- SEC-17b: user_roles follows profiles.user_type (users cannot change user_type, so this only fires for support edits).
CREATE OR REPLACE FUNCTION public.sync_user_role_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_type::text IN ('accountant', 'client') THEN
    DELETE FROM public.user_roles WHERE user_id = NEW.user_id AND role::text <> NEW.user_type::text;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, NEW.user_type::text::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_user_role_from_profile() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS profiles_sync_user_role ON public.profiles;
CREATE TRIGGER profiles_sync_user_role AFTER UPDATE OF user_type ON public.profiles
  FOR EACH ROW WHEN (OLD.user_type IS DISTINCT FROM NEW.user_type)
  EXECUTE FUNCTION public.sync_user_role_from_profile();
