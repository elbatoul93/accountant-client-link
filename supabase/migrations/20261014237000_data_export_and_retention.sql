-- Data export, account-deletion pre-check and chat/notification purge (retention policy, decided by default).

-- 1) Export: everything the caller can see, as one JSON document. SECURITY INVOKER, so RLS decides what is
--    included (a user only ever gets their own rows). Works in read-only mode (reads are never blocked).
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
    'acc_assets', 'acc_payroll_runs', 'acc_payslips', 'acc_checklist', 'acc_reminders_sent',
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

-- 2) Records the retention policy keeps (10 years) that an erasure would cascade away.
--    The delete-account edge function refuses while any of these is non-zero and points to support.
CREATE OR REPLACE FUNCTION public.my_deletion_blockers()
RETURNS TABLE (kind text, n bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'signed_documents', count(*) FROM public.acc_shared_documents
    WHERE signed_at IS NOT NULL AND (accountant_id = auth.uid() OR client_user_id = auth.uid())
  UNION ALL
  SELECT 'final_payroll_runs', count(*) FROM public.acc_payroll_runs
    WHERE status = 'final' AND accountant_id = auth.uid()
  UNION ALL
  SELECT 'locked_periods', count(*) FROM public.acc_period_locks WHERE accountant_id = auth.uid()
  UNION ALL
  SELECT 'sent_g50', count(*) FROM public.g50_declarations
    WHERE sent AND (accountant_id = auth.uid() OR client_id = auth.uid())
  UNION ALL
  SELECT 'receipts', count(*) FROM public.payment_receipts WHERE accountant_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_deletion_blockers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_deletion_blockers() TO authenticated;

-- 3) Purge chat messages and notifications older than 2 years (internal; no API role can call it).
CREATE OR REPLACE FUNCTION public.purge_old_chat(_months int DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE m bigint; n bigint;
BEGIN
  IF _months < 12 THEN RAISE EXCEPTION 'Refusing to purge data younger than 12 months'; END IF;
  DELETE FROM public.messages WHERE created_at < now() - make_interval(months => _months)
    AND ref_doc_id IS NULL;           -- messages tied to a document stay with it
  GET DIAGNOSTICS m = ROW_COUNT;
  DELETE FROM public.notifications WHERE created_at < now() - make_interval(months => _months);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('messages', m, 'notifications', n);
END;
$$;
REVOKE ALL ON FUNCTION public.purge_old_chat(int) FROM PUBLIC, anon, authenticated;

-- Schedule monthly when pg_cron is available (Supabase: enable the extension in the dashboard first).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('purge-old-chat', '0 3 1 * *', 'SELECT public.purge_old_chat(24)');
  ELSE
    RAISE NOTICE 'pg_cron not enabled: schedule purge_old_chat(24) monthly once it is';
  END IF;
END $$;
