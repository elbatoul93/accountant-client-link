-- Deep audit ARC-1 / ARC-2: move the data that only lived in browser localStorage into Postgres.
-- Replaces these keys: mgmtk_acc_clients, mgmtk_acc_employees, mgmtk_acc_bills, mgmtk_acc_journal,
-- mgmtk_acc_period_locks, mgmtk_acc_tva_precompte, mgmtk_acc_assets, mgmtk_portal_notifications,
-- mgmtk_portal_incoming_invoices, mgmtk_portal_checklist, mgmtk_portal_reminders_sent,
-- mgmtk_portal_chat (use public.messages), mgmtk_client_docs (use public.documents).
-- Conventions: every accountant-owned table has accountant_id; client_ref is the same text id the
-- existing acc_* tables use (acc_clients.client_ref); clients get read-only access to their own rows.

-- ---------------------------------------------------------------- acc_clients
CREATE TABLE public.acc_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_ref text NOT NULL DEFAULT gen_random_uuid()::text,   -- legacy local id, used by acc_* tables
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
  company text,
  tax_id text,
  email text,
  tax_regime text CHECK (tax_regime IN ('REEL','SIMPLIFIE','IFU')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','review')),
  linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- the client's portal account
  -- bp, nis, rc, cnas_no, casnos_no, has_cacobatph, phone, address, legal_form, activity,
  -- direction, commune, contact (all optional strings/booleans, same names as the UI uses, snake_case)
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(data::text) <= 20000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accountant_id, client_ref)
);
CREATE INDEX acc_clients_linked_user_idx ON public.acc_clients (linked_user_id);
CREATE INDEX acc_clients_email_idx ON public.acc_clients (accountant_id, lower(email));

-- Auto-link a record to the portal account that has the same email and is linked to this accountant.
CREATE OR REPLACE FUNCTION public.acc_clients_autolink()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.linked_user_id IS NULL AND NEW.email IS NOT NULL AND NEW.email <> '' THEN
    SELECT p.user_id INTO NEW.linked_user_id
      FROM public.profiles p
      WHERE lower(p.email) = lower(NEW.email) AND p.linked_accountant_id = NEW.accountant_id
      LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.acc_clients_autolink() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER acc_clients_autolink_trg BEFORE INSERT OR UPDATE OF email ON public.acc_clients
  FOR EACH ROW EXECUTE FUNCTION public.acc_clients_autolink();

-- When a client signs up through an invite, attach any record the accountant already created for them.
CREATE OR REPLACE FUNCTION public.profiles_link_acc_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.linked_accountant_id IS NOT NULL AND NEW.email <> '' THEN
    UPDATE public.acc_clients SET linked_user_id = NEW.user_id
      WHERE accountant_id = NEW.linked_accountant_id
        AND linked_user_id IS NULL
        AND lower(email) = lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_link_acc_client() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER profiles_link_acc_client_trg AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_link_acc_client();

-- ---------------------------------------------------------------- is_my_client_ref (needs acc_clients)
-- True when the row belongs to a client record linked to the current user AND the user is still
-- linked to that accountant (so unlinking removes access).
CREATE OR REPLACE FUNCTION public.is_my_client_ref(_accountant_id uuid, _client_ref text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _accountant_id IS NOT NULL
    AND _accountant_id = public.get_my_linked_accountant_id()
    AND EXISTS (
      SELECT 1 FROM public.acc_clients c
      WHERE c.accountant_id = _accountant_id
        AND c.client_ref = _client_ref
        AND c.linked_user_id = auth.uid()
    );
$$;
REVOKE ALL ON FUNCTION public.is_my_client_ref(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_my_client_ref(uuid, text) TO authenticated;

-- ---------------------------------------------------------------- acc_employees
CREATE TABLE public.acc_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_ref text,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
  position text,
  basic numeric NOT NULL DEFAULT 0 CHECK (basic >= 0),
  iew numeric NOT NULL DEFAULT 0 CHECK (iew >= 0),
  prc numeric NOT NULL DEFAULT 0 CHECK (prc >= 0),
  other numeric NOT NULL DEFAULT 0 CHECK (other >= 0),
  dependents int NOT NULL DEFAULT 0 CHECK (dependents >= 0),
  nss text,
  hire_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (accountant_id, client_ref) REFERENCES public.acc_clients (accountant_id, client_ref) ON DELETE CASCADE
);
CREATE INDEX acc_employees_acc_client_idx ON public.acc_employees (accountant_id, client_ref);

-- ---------------------------------------------------------------- acc_bills
CREATE TABLE public.acc_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_ref text,
  kind text NOT NULL CHECK (kind IN ('purchase','sales')),
  number text NOT NULL,
  bill_date date NOT NULL,
  party text NOT NULL,
  party_tax_id text,
  ht numeric NOT NULL DEFAULT 0,
  tva_rate numeric NOT NULL DEFAULT 0 CHECK (tva_rate >= 0),
  tva numeric NOT NULL DEFAULT 0,
  ttc numeric NOT NULL DEFAULT 0,
  account text,                 -- PCN account override
  posted_batch text,            -- batch_id of the journal lines generated for this bill
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (accountant_id, client_ref) REFERENCES public.acc_clients (accountant_id, client_ref) ON DELETE CASCADE
);
CREATE INDEX acc_bills_acc_client_date_idx ON public.acc_bills (accountant_id, client_ref, bill_date);

-- ---------------------------------------------------------------- journal and period locks
CREATE TABLE public.acc_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_ref text,
  entry_date date NOT NULL,
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  account text NOT NULL,
  label text NOT NULL DEFAULT '',
  debit numeric NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric NOT NULL DEFAULT 0 CHECK (credit >= 0),
  source text NOT NULL,
  batch_id text NOT NULL,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (accountant_id, client_ref) REFERENCES public.acc_clients (accountant_id, client_ref) ON DELETE CASCADE
);
CREATE INDEX acc_journal_acc_client_period_idx ON public.acc_journal_lines (accountant_id, client_ref, period);
CREATE INDEX acc_journal_batch_idx ON public.acc_journal_lines (accountant_id, batch_id);

CREATE TABLE public.acc_period_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_ref text,
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  validated_at timestamptz NOT NULL DEFAULT now(),
  reference text,               -- declaration id (G50 etc.)
  FOREIGN KEY (accountant_id, client_ref) REFERENCES public.acc_clients (accountant_id, client_ref) ON DELETE CASCADE
);
CREATE UNIQUE INDEX acc_period_locks_unique ON public.acc_period_locks (accountant_id, coalesce(client_ref, ''), period);

-- A locked period is frozen: no journal line may be added, changed or removed in it.
-- Import order matters: insert journal lines first, locks last.
CREATE OR REPLACE FUNCTION public.acc_period_is_locked(_accountant_id uuid, _client_ref text, _period text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.acc_period_locks l
    WHERE l.accountant_id = _accountant_id
      AND coalesce(l.client_ref, '') = coalesce(_client_ref, '')
      AND l.period = _period
  );
$$;

CREATE OR REPLACE FUNCTION public.acc_journal_enforce_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND public.acc_period_is_locked(OLD.accountant_id, OLD.client_ref, OLD.period) THEN
    RAISE EXCEPTION 'Period % is locked', OLD.period;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND public.acc_period_is_locked(NEW.accountant_id, NEW.client_ref, NEW.period) THEN
    RAISE EXCEPTION 'Period % is locked', NEW.period;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER acc_journal_lock_trg BEFORE INSERT OR UPDATE OR DELETE ON public.acc_journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.acc_journal_enforce_lock();

-- ---------------------------------------------------------------- precompte TVA and assets
CREATE TABLE public.acc_tva_precompte (
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_ref text NOT NULL DEFAULT '',   -- '' = accountant-level (no client)
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (accountant_id, client_ref, period)
);

CREATE TABLE public.acc_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_ref text,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 300),
  category text NOT NULL CHECK (category IN ('buildings','industrial','office','computers','vehicles','intangible')),
  acquired_at date NOT NULL,
  cost numeric NOT NULL CHECK (cost >= 0),
  rate_override numeric CHECK (rate_override IS NULL OR (rate_override >= 0 AND rate_override <= 100)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (accountant_id, client_ref) REFERENCES public.acc_clients (accountant_id, client_ref) ON DELETE CASCADE
);
CREATE INDEX acc_assets_acc_client_idx ON public.acc_assets (accountant_id, client_ref);

-- ---------------------------------------------------------------- payroll runs and payslips
-- A run is one client + one month. Finalised runs are immutable snapshots, so annual declarations
-- (DAS) can be built from what was really paid instead of projecting from the current payslip.
CREATE TABLE public.acc_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_ref text,
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  finalized_at timestamptz,
  journal_batch_id text,        -- batch_id of the journal lines posted for this run
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (accountant_id, client_ref) REFERENCES public.acc_clients (accountant_id, client_ref) ON DELETE CASCADE
);
CREATE UNIQUE INDEX acc_payroll_runs_unique ON public.acc_payroll_runs (accountant_id, coalesce(client_ref, ''), period);

CREATE TABLE public.acc_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.acc_payroll_runs(id) ON DELETE CASCADE,
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_ref text,
  employee_id uuid REFERENCES public.acc_employees(id) ON DELETE SET NULL,
  employee_name text NOT NULL,           -- snapshots: employees can be renamed or deleted later
  nss text,
  basic numeric NOT NULL DEFAULT 0, iew numeric NOT NULL DEFAULT 0, prc numeric NOT NULL DEFAULT 0, other numeric NOT NULL DEFAULT 0,
  gross numeric NOT NULL DEFAULT 0, ss_base numeric NOT NULL DEFAULT 0, ss_employee numeric NOT NULL DEFAULT 0,
  taxable numeric NOT NULL DEFAULT 0, irg numeric NOT NULL DEFAULT 0, net numeric NOT NULL DEFAULT 0,
  ss_employer numeric NOT NULL DEFAULT 0, employer_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (accountant_id, client_ref) REFERENCES public.acc_clients (accountant_id, client_ref) ON DELETE CASCADE
);
CREATE INDEX acc_payslips_run_idx ON public.acc_payslips (run_id);
CREATE INDEX acc_payslips_acc_client_idx ON public.acc_payslips (accountant_id, client_ref);

CREATE OR REPLACE FUNCTION public.acc_payroll_run_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND OLD.status = 'final' THEN
    RAISE EXCEPTION 'A finalised payroll run cannot be changed or deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'final' AND OLD.status = 'draft' THEN
    NEW.finalized_at := now();
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER acc_payroll_run_guard_trg BEFORE UPDATE OR DELETE ON public.acc_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.acc_payroll_run_guard();

CREATE OR REPLACE FUNCTION public.acc_payslip_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _rid uuid := CASE WHEN TG_OP = 'INSERT' THEN NEW.run_id ELSE OLD.run_id END;
BEGIN
  -- Cascade deletes from a draft run reach here as DELETE; final runs are blocked above.
  IF auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.acc_payroll_runs r WHERE r.id = _rid AND r.status = 'final') THEN
    RAISE EXCEPTION 'Payslips of a finalised run cannot be changed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER acc_payslip_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.acc_payslips
  FOR EACH ROW EXECUTE FUNCTION public.acc_payslip_guard();

-- ---------------------------------------------------------------- monthly document checklist and reminders
CREATE TABLE public.acc_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_ref text NOT NULL,
  month_key text NOT NULL CHECK (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  kind text NOT NULL CHECK (kind IN ('SALES','PURCHASES','BANK','PAYROLL','EXPENSES','OTHER')),
  status text NOT NULL DEFAULT 'missing' CHECK (status IN ('missing','received','validated')),
  received_at timestamptz,
  ref_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accountant_id, client_ref, month_key, kind),
  FOREIGN KEY (accountant_id, client_ref) REFERENCES public.acc_clients (accountant_id, client_ref) ON DELETE CASCADE
);

CREATE TABLE public.acc_reminders_sent (
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_ref text NOT NULL,
  month_key text NOT NULL CHECK (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (accountant_id, client_ref, month_key),
  FOREIGN KEY (accountant_id, client_ref) REFERENCES public.acc_clients (accountant_id, client_ref) ON DELETE CASCADE
);

-- Clients may only mark an item as received (with the document they uploaded).
CREATE OR REPLACE FUNCTION public.protect_checklist_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> OLD.accountant_id THEN
    IF to_jsonb(NEW) - ARRAY['status','received_at','ref_document_id','updated_at']
       IS DISTINCT FROM to_jsonb(OLD) - ARRAY['status','received_at','ref_document_id','updated_at']
       OR NEW.status <> 'received' OR OLD.status <> 'missing' THEN
      RAISE EXCEPTION 'Clients can only mark a missing item as received';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER acc_checklist_protect BEFORE UPDATE ON public.acc_checklist
  FOR EACH ROW EXECUTE FUNCTION public.protect_checklist_fields();

-- ---------------------------------------------------------------- notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('invoice_uploaded','g50_ready','doc_signed','info')),
  title text NOT NULL CHECK (char_length(title) <= 200),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 2000),
  link text CHECK (link IS NULL OR link LIKE '/%'),     -- in-app route only
  ref_id text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_recipient_idx ON public.notifications (recipient_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON public.notifications (recipient_id) WHERE read = false;

CREATE OR REPLACE FUNCTION public.protect_notification_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (to_jsonb(NEW) - 'read') IS DISTINCT FROM (to_jsonb(OLD) - 'read') THEN
    RAISE EXCEPTION 'Only read can be updated on a notification';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notifications_protect BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.protect_notification_fields();

-- ---------------------------------------------------------------- reuse documents and messages
-- documents = the client's uploads. Incoming invoices become documents with kind = 'invoice'.
ALTER TABLE public.documents
  ADD COLUMN kind text NOT NULL DEFAULT 'document' CHECK (kind IN ('document','invoice')),
  ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','review')),
  ADD COLUMN note text CHECK (note IS NULL OR char_length(note) <= 2000);
CREATE INDEX idx_documents_user_kind ON public.documents (user_id, kind, created_at DESC);

CREATE POLICY "Linked accountant can triage client documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (public.is_linked_accountant(user_id))
  WITH CHECK (public.is_linked_accountant(user_id));

CREATE OR REPLACE FUNCTION public.protect_document_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> OLD.user_id THEN
    IF to_jsonb(NEW) - ARRAY['status','note','updated_at'] IS DISTINCT FROM to_jsonb(OLD) - ARRAY['status','note','updated_at'] THEN
      RAISE EXCEPTION 'Accountants can only update status and note';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER documents_protect BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.protect_document_fields();

-- Chat uses public.messages (realtime, linked-only); optional pointer to a document.
ALTER TABLE public.messages ADD COLUMN ref_doc_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acc_clients','acc_employees','acc_bills','acc_journal_lines','acc_tva_precompte','acc_assets','acc_checklist','acc_payroll_runs'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t || '_set_updated', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acc_clients','acc_employees','acc_bills','acc_journal_lines','acc_period_locks',
                           'acc_tva_precompte','acc_assets','acc_checklist','acc_reminders_sent','acc_payroll_runs','acc_payslips'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY "Accountant select own" ON public.%I FOR SELECT TO authenticated USING (auth.uid() = accountant_id)$p$, t);
    EXECUTE format($p$CREATE POLICY "Accountant insert own" ON public.%I FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = accountant_id AND public.has_role(auth.uid(), 'accountant'::public.app_role))$p$, t);
    EXECUTE format($p$CREATE POLICY "Accountant update own" ON public.%I FOR UPDATE TO authenticated
      USING (auth.uid() = accountant_id) WITH CHECK (auth.uid() = accountant_id)$p$, t);
  END LOOP;
  -- Period locks are never deleted by users (unlocking needs a deliberate decision, see audit).
  FOREACH t IN ARRAY ARRAY['acc_clients','acc_employees','acc_bills','acc_journal_lines',
                           'acc_tva_precompte','acc_assets','acc_checklist','acc_reminders_sent','acc_payroll_runs','acc_payslips'] LOOP
    EXECUTE format($p$CREATE POLICY "Accountant delete own" ON public.%I FOR DELETE TO authenticated USING (auth.uid() = accountant_id)$p$, t);
  END LOOP;
END $$;
-- Period locks have no UPDATE either: drop the generic one created above.
DROP POLICY "Accountant update own" ON public.acc_period_locks;

-- acc_clients: the linked user must really be linked to this accountant.
DROP POLICY "Accountant insert own" ON public.acc_clients;
CREATE POLICY "Accountant insert own" ON public.acc_clients FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = accountant_id AND public.has_role(auth.uid(), 'accountant'::public.app_role)
              AND (linked_user_id IS NULL OR public.is_linked_accountant(linked_user_id)));
DROP POLICY "Accountant update own" ON public.acc_clients;
CREATE POLICY "Accountant update own" ON public.acc_clients FOR UPDATE TO authenticated
  USING (auth.uid() = accountant_id)
  WITH CHECK (auth.uid() = accountant_id AND (linked_user_id IS NULL OR public.is_linked_accountant(linked_user_id)));

-- Clients: read-only access to their own record and to the rows the accountant keeps for them.
CREATE POLICY "Client select own record" ON public.acc_clients FOR SELECT TO authenticated
  USING (linked_user_id = auth.uid() AND accountant_id = public.get_my_linked_accountant_id());
CREATE POLICY "Client select own employees" ON public.acc_employees FOR SELECT TO authenticated
  USING (public.is_my_client_ref(accountant_id, client_ref));
CREATE POLICY "Client select own payroll runs" ON public.acc_payroll_runs FOR SELECT TO authenticated
  USING (status = 'final' AND public.is_my_client_ref(accountant_id, client_ref));
CREATE POLICY "Client select own payslips" ON public.acc_payslips FOR SELECT TO authenticated
  USING (public.is_my_client_ref(accountant_id, client_ref)
         AND EXISTS (SELECT 1 FROM public.acc_payroll_runs r WHERE r.id = run_id AND r.status = 'final'));
CREATE POLICY "Client select own checklist" ON public.acc_checklist FOR SELECT TO authenticated
  USING (public.is_my_client_ref(accountant_id, client_ref));
CREATE POLICY "Client mark checklist received" ON public.acc_checklist FOR UPDATE TO authenticated
  USING (public.is_my_client_ref(accountant_id, client_ref))
  WITH CHECK (public.is_my_client_ref(accountant_id, client_ref));
-- Existing tables get the same client read access (ARC-2: ClientDashboard).
CREATE POLICY "Client select own invoices" ON public.acc_invoices FOR SELECT TO authenticated
  USING (public.is_my_client_ref(accountant_id, client_ref));
CREATE POLICY "Client select own declarations" ON public.acc_declarations FOR SELECT TO authenticated
  USING (public.is_my_client_ref(accountant_id, client_ref));
CREATE POLICY "Client select own statements" ON public.acc_financial_statements FOR SELECT TO authenticated
  USING (public.is_my_client_ref(accountant_id, client_ref));
CREATE POLICY "Client select own legal docs" ON public.acc_legal_documents FOR SELECT TO authenticated
  USING (public.is_my_client_ref(accountant_id, client_ref));

-- Clients may upload invoices to their accountant: acc_invoices is accountant-owned, so incoming
-- invoices are rows in public.documents (kind = 'invoice'), which the linked accountant already reads.

-- notifications: recipient reads and marks read; senders may only target their linked counterpart.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recipient reads notifications" ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());
CREATE POLICY "Recipient marks notifications read" ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
CREATE POLICY "Recipient deletes notifications" ON public.notifications FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());
CREATE POLICY "Linked parties send notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (public.is_linked_accountant(recipient_id) OR recipient_id = public.get_my_linked_accountant_id())
  );
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

REVOKE ALL ON public.acc_clients, public.acc_employees, public.acc_bills, public.acc_journal_lines,
  public.acc_period_locks, public.acc_tva_precompte, public.acc_assets, public.acc_checklist,
  public.acc_reminders_sent, public.acc_payroll_runs, public.acc_payslips, public.notifications FROM anon;

NOTIFY pgrst, 'reload schema';
