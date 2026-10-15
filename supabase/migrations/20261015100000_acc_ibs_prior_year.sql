-- BIZ-11: the IBS of the previous financial year (IBS N-1) drives the three acomptes (March, June, November).
-- The accountant used to type it every time; store it per client and acompte year instead.
-- Same tenant rules as the other business-data tables: own rows only, active accountant, read-only when the
-- subscription lapsed, deleted with the client and with the account.
CREATE TABLE public.acc_ibs_prior_year (
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_ref text NOT NULL,
  year int NOT NULL CHECK (year BETWEEN 2000 AND 2100),   -- year in which the acomptes are paid
  amount numeric NOT NULL CHECK (amount >= 0),             -- IBS due for the previous financial year (DA)
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (accountant_id, client_ref, year),
  FOREIGN KEY (accountant_id, client_ref) REFERENCES public.acc_clients (accountant_id, client_ref) ON DELETE CASCADE
);

CREATE TRIGGER acc_ibs_prior_year_set_updated BEFORE UPDATE ON public.acc_ibs_prior_year
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.acc_ibs_prior_year ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accountant select own" ON public.acc_ibs_prior_year FOR SELECT TO authenticated
  USING (auth.uid() = accountant_id);
CREATE POLICY "Accountant insert own" ON public.acc_ibs_prior_year FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = accountant_id AND public.has_role(auth.uid(), 'accountant'::public.app_role));
CREATE POLICY "Accountant update own" ON public.acc_ibs_prior_year FOR UPDATE TO authenticated
  USING (auth.uid() = accountant_id) WITH CHECK (auth.uid() = accountant_id);
CREATE POLICY "Accountant delete own" ON public.acc_ibs_prior_year FOR DELETE TO authenticated
  USING (auth.uid() = accountant_id);

-- Only active accountants write; nobody writes when the subscription is read-only.
CREATE POLICY "Accountant must be active" ON public.acc_ibs_prior_year AS RESTRICTIVE FOR ALL TO authenticated
  USING (accountant_id IS DISTINCT FROM auth.uid() OR public.is_active_accountant())
  WITH CHECK (accountant_id IS DISTINCT FROM auth.uid() OR public.is_active_accountant());
CREATE POLICY "Subscription read-only insert" ON public.acc_ibs_prior_year AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (accountant_id IS DISTINCT FROM auth.uid() OR NOT public.subscription_read_only());
CREATE POLICY "Subscription read-only update" ON public.acc_ibs_prior_year AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (accountant_id IS DISTINCT FROM auth.uid() OR NOT public.subscription_read_only());
CREATE POLICY "Subscription read-only delete" ON public.acc_ibs_prior_year AS RESTRICTIVE FOR DELETE TO authenticated
  USING (accountant_id IS DISTINCT FROM auth.uid() OR NOT public.subscription_read_only());

REVOKE ALL ON public.acc_ibs_prior_year FROM anon;

NOTIFY pgrst, 'reload schema';
