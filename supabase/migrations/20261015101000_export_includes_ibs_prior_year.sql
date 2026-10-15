-- The data export now includes acc_ibs_prior_year (added in 20261015100000). Erasure needs no change: the table's
-- accountant_id references auth.users ON DELETE CASCADE, so deleting the account removes it, and it is a working
-- figure (not a retained record), so it is not a deletion blocker.
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  t text;
  rows jsonb;
  result jsonb := jsonb_build_object('exported_at', now(), 'user_id', auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'user_roles', 'subscriptions', 'payment_receipts', 'audit_log',
    'acc_clients', 'acc_employees', 'acc_bills', 'acc_journal_lines', 'acc_period_locks', 'acc_tva_precompte',
    'acc_assets', 'acc_ibs_prior_year', 'acc_payroll_runs', 'acc_payslips', 'acc_checklist', 'acc_reminders_sent',
    'acc_invoices', 'acc_declarations', 'acc_financial_statements', 'acc_legal_documents', 'acc_shared_documents',
    'g50_declarations', 'shared_documents', 'documents', 'invitations', 'messages', 'notifications']
  LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM public.%I x', t) INTO rows;
    result := result || jsonb_build_object(t, rows);
  END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.export_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;
