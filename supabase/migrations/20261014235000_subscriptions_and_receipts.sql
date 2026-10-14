-- Subscription state and numbered cash receipts (decided by default; Mo can shelve).
-- Nothing is restricted until an admin sets an end date: an accountant with no subscription row,
-- or with neither trial_ends_at nor paid_until, is 'unrestricted'. Existing accounts are unaffected.

CREATE TABLE public.subscriptions (
  accountant_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'standard' CHECK (char_length(plan) BETWEEN 1 AND 40),
  trial_ends_at timestamptz,
  paid_until timestamptz,
  grace_days int NOT NULL DEFAULT 7 CHECK (grace_days BETWEEN 0 AND 90),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accountant reads own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (accountant_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscriptions FROM anon, authenticated;
REVOKE ALL ON public.subscriptions FROM anon;

-- State machine: unrestricted | trial | active | grace | read_only
CREATE OR REPLACE FUNCTION public.subscription_state_of(_accountant_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.accountant_id IS NULL OR (s.trial_ends_at IS NULL AND s.paid_until IS NULL) THEN 'unrestricted'
    WHEN s.paid_until IS NOT NULL AND now() <= s.paid_until THEN 'active'
    WHEN s.trial_ends_at IS NOT NULL AND now() <= s.trial_ends_at AND (s.paid_until IS NULL OR now() > s.paid_until) THEN 'trial'
    WHEN now() <= greatest(coalesce(s.paid_until, '-infinity'), coalesce(s.trial_ends_at, '-infinity')) + make_interval(days => s.grace_days) THEN 'grace'
    ELSE 'read_only'
  END
  FROM (SELECT 1) one
  LEFT JOIN public.subscriptions s ON s.accountant_id = _accountant_id;
$$;
REVOKE ALL ON FUNCTION public.subscription_state_of(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.subscription_read_only()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.subscription_state_of(auth.uid()) = 'read_only';
$$;
REVOKE ALL ON FUNCTION public.subscription_read_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_read_only() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_subscription()
RETURNS TABLE (plan text, state text, trial_ends_at timestamptz, paid_until timestamptz, grace_days int, ends_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(s.plan, 'standard'), public.subscription_state_of(auth.uid()),
         s.trial_ends_at, s.paid_until, coalesce(s.grace_days, 7),
         nullif(greatest(coalesce(s.paid_until, '-infinity'), coalesce(s.trial_ends_at, '-infinity')), '-infinity')
  FROM (SELECT 1) one
  LEFT JOIN public.subscriptions s ON s.accountant_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_subscription() TO authenticated;

-- Read-only mode in the database: writes to the accountant's own data are rejected.
DO $$
DECLARE t text; c text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'acc_invoices','acc_declarations','acc_financial_statements','acc_shared_documents','acc_legal_documents',
    'g50_declarations','shared_documents','invitations',
    'acc_clients','acc_employees','acc_bills','acc_journal_lines','acc_period_locks','acc_tva_precompte',
    'acc_assets','acc_checklist','acc_reminders_sent','acc_payroll_runs','acc_payslips'] LOOP
    FOREACH c IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      IF c = 'INSERT' THEN
        EXECUTE format($p$CREATE POLICY "Subscription read-only %s" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
          WITH CHECK (accountant_id IS DISTINCT FROM auth.uid() OR NOT public.subscription_read_only())$p$, lower(c), t);
      ELSE
        EXECUTE format($p$CREATE POLICY "Subscription read-only %s" ON public.%I AS RESTRICTIVE FOR %s TO authenticated
          USING (accountant_id IS DISTINCT FROM auth.uid() OR NOT public.subscription_read_only())$p$, lower(c), t, c);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Billing settings (issuer details printed on receipts), one row, edited by admins.
CREATE TABLE public.billing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  issuer jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(issuer::text) <= 4000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.billing_settings (id) VALUES (true);
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_settings FROM anon, authenticated;

-- Receipts: gapless sequential numbers per year, immutable (void instead of delete).
CREATE TABLE public.receipt_counters (
  year int PRIMARY KEY,
  last_no int NOT NULL DEFAULT 0
);
ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.receipt_counters FROM anon, authenticated;

CREATE TABLE public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no text NOT NULL UNIQUE,
  year int NOT NULL,
  seq int NOT NULL,
  accountant_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,   -- receipts outlive the account
  payer jsonb NOT NULL,                       -- snapshot: name, company, email
  issuer jsonb NOT NULL DEFAULT '{}'::jsonb,  -- snapshot of billing_settings.issuer
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'DZD',
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','transfer','cheque','other')),
  plan text NOT NULL,
  period_months int NOT NULL CHECK (period_months BETWEEN 1 AND 36),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text,
  UNIQUE (year, seq)
);
CREATE INDEX payment_receipts_accountant_idx ON public.payment_receipts (accountant_id, created_at DESC);
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accountant reads own receipts" ON public.payment_receipts
  FOR SELECT TO authenticated USING (accountant_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_receipts FROM anon, authenticated;
REVOKE ALL ON public.payment_receipts FROM anon;

-- Immutable except voiding (and nulling accountant_id when the account is erased), for every role.
CREATE OR REPLACE FUNCTION public.payment_receipt_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Receipts cannot be deleted; void them instead';
  END IF;
  IF OLD.voided_at IS NULL
     AND (to_jsonb(NEW) - ARRAY['voided_at','void_reason']) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['voided_at','void_reason']) THEN
    RETURN NEW;  -- voiding
  END IF;
  IF NEW.accountant_id IS NULL
     AND (to_jsonb(NEW) - 'accountant_id') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'accountant_id') THEN
    RETURN NEW;  -- account erased (FK ON DELETE SET NULL)
  END IF;
  RAISE EXCEPTION 'Receipts are immutable';
END;
$$;
CREATE TRIGGER payment_receipt_guard_trg BEFORE UPDATE OR DELETE ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.payment_receipt_guard();

-- ---------------------------------------------------------------- admin API
CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  _accountant_id uuid, _plan text, _trial_ends_at timestamptz, _paid_until timestamptz, _grace_days int DEFAULT 7)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _accountant_id AND user_type = 'accountant') THEN
    RAISE EXCEPTION 'Accountant not found';
  END IF;
  INSERT INTO public.subscriptions (accountant_id, plan, trial_ends_at, paid_until, grace_days, updated_by)
  VALUES (_accountant_id, coalesce(nullif(_plan, ''), 'standard'), _trial_ends_at, _paid_until, coalesce(_grace_days, 7), auth.uid())
  ON CONFLICT (accountant_id) DO UPDATE SET
    plan = EXCLUDED.plan, trial_ends_at = EXCLUDED.trial_ends_at, paid_until = EXCLUDED.paid_until,
    grace_days = EXCLUDED.grace_days, updated_at = now(), updated_by = auth.uid();
  INSERT INTO public.audit_log (actor_id, accountant_id, action, entity, entity_id, detail)
  VALUES (auth.uid(), _accountant_id, 'subscription.set', 'subscriptions', _accountant_id::text,
          jsonb_build_object('plan', _plan, 'trial_ends_at', _trial_ends_at, 'paid_until', _paid_until, 'grace_days', _grace_days));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_subscriptions()
RETURNS TABLE (user_id uuid, name text, email text, company text, account_status text, plan text, state text,
               trial_ends_at timestamptz, paid_until timestamptz, grace_days int)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY
    SELECT p.user_id, p.name, p.email, p.company, p.account_status,
           coalesce(s.plan, 'standard'), public.subscription_state_of(p.user_id),
           s.trial_ends_at, s.paid_until, coalesce(s.grace_days, 7)
    FROM public.profiles p LEFT JOIN public.subscriptions s ON s.accountant_id = p.user_id
    WHERE p.user_type = 'accountant'
    ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_billing_settings(_issuer jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.billing_settings SET issuer = coalesce(_issuer, '{}'::jsonb), updated_at = now() WHERE id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_billing_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN (SELECT issuer FROM public.billing_settings WHERE id);
END;
$$;

-- Record a payment: issues the next receipt number and extends paid_until in one transaction.
CREATE OR REPLACE FUNCTION public.admin_record_payment(
  _accountant_id uuid, _amount numeric, _period_months int,
  _method text DEFAULT 'cash', _plan text DEFAULT NULL, _paid_at date DEFAULT CURRENT_DATE, _note text DEFAULT NULL)
RETURNS public.payment_receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p public.profiles;
  _sub public.subscriptions;
  _year int := extract(year FROM _paid_at)::int;
  _seq int;
  _start timestamptz;
  _end timestamptz;
  _plan_final text;
  _row public.payment_receipts;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO _p FROM public.profiles WHERE user_id = _accountant_id AND user_type = 'accountant';
  IF NOT FOUND THEN RAISE EXCEPTION 'Accountant not found'; END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE accountant_id = _accountant_id FOR UPDATE;
  _plan_final := coalesce(nullif(_plan, ''), _sub.plan, 'standard');
  _start := greatest(coalesce(_sub.paid_until, now()), now());
  _end := _start + make_interval(months => _period_months);

  -- Gapless counter: the row lock serialises concurrent receipts of the same year.
  INSERT INTO public.receipt_counters (year, last_no) VALUES (_year, 0) ON CONFLICT (year) DO NOTHING;
  UPDATE public.receipt_counters SET last_no = last_no + 1 WHERE year = _year RETURNING last_no INTO _seq;

  INSERT INTO public.payment_receipts (receipt_no, year, seq, accountant_id, payer, issuer, amount, method, plan,
                                       period_months, period_start, period_end, paid_at, note, issued_by)
  VALUES ('REC-' || _year || '-' || lpad(_seq::text, 6, '0'), _year, _seq, _accountant_id,
          jsonb_build_object('name', _p.name, 'company', _p.company, 'email', _p.email),
          (SELECT issuer FROM public.billing_settings WHERE id),
          _amount, _method, _plan_final, _period_months, _start, _end, _paid_at, _note, auth.uid())
  RETURNING * INTO _row;

  INSERT INTO public.subscriptions (accountant_id, plan, paid_until, updated_by)
  VALUES (_accountant_id, _plan_final, _end, auth.uid())
  ON CONFLICT (accountant_id) DO UPDATE SET plan = _plan_final, paid_until = _end, updated_at = now(), updated_by = auth.uid();

  INSERT INTO public.audit_log (actor_id, accountant_id, action, entity, entity_id, detail)
  VALUES (auth.uid(), _accountant_id, 'payment.recorded', 'payment_receipts', _row.id::text,
          jsonb_build_object('receipt_no', _row.receipt_no, 'amount', _amount, 'paid_until', _end));
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_void_receipt(_receipt_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF coalesce(_reason, '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  UPDATE public.payment_receipts SET voided_at = now(), void_reason = left(_reason, 500)
    WHERE id = _receipt_id AND voided_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found or already void'; END IF;
  INSERT INTO public.audit_log (actor_id, accountant_id, action, entity, entity_id, detail)
  SELECT auth.uid(), accountant_id, 'receipt.voided', 'payment_receipts', id::text, jsonb_build_object('reason', _reason)
  FROM public.payment_receipts WHERE id = _receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_receipts(_accountant_id uuid DEFAULT NULL)
RETURNS SETOF public.payment_receipts
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY SELECT * FROM public.payment_receipts r
    WHERE _accountant_id IS NULL OR r.accountant_id = _accountant_id
    ORDER BY r.year DESC, r.seq DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_subscription(uuid, text, timestamptz, timestamptz, int),
  public.admin_list_subscriptions(), public.admin_set_billing_settings(jsonb), public.admin_get_billing_settings(),
  public.admin_record_payment(uuid, numeric, int, text, text, date, text),
  public.admin_void_receipt(uuid, text), public.admin_list_receipts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(uuid, text, timestamptz, timestamptz, int),
  public.admin_list_subscriptions(), public.admin_set_billing_settings(jsonb), public.admin_get_billing_settings(),
  public.admin_record_payment(uuid, numeric, int, text, text, date, text),
  public.admin_void_receipt(uuid, text), public.admin_list_receipts(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
