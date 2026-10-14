-- my_deletion_blockers: count a G50 as sent when the client actually received it.
-- The send flow writes the PDF row to shared_documents first and flips g50_declarations.sent last, so a send that
-- stopped half-way left a delivered PDF with sent = false and the account could still be deleted (which cascades the
-- shared_documents and g50_declarations rows the accountant needs). Now: a G50 counts when it is flagged sent OR has
-- a delivered PDF, and any PDF delivered through shared_documents holds the account too.
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
  SELECT 'sent_g50', count(*) FROM public.g50_declarations g
    WHERE (g.accountant_id = auth.uid() OR g.client_id = auth.uid())
      AND (g.sent OR EXISTS (SELECT 1 FROM public.shared_documents d WHERE d.g50_declaration_id = g.id))
  UNION ALL
  SELECT 'delivered_documents', count(*) FROM public.shared_documents d
    WHERE d.accountant_id = auth.uid() OR d.client_id = auth.uid()
  UNION ALL
  SELECT 'receipts', count(*) FROM public.payment_receipts WHERE accountant_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_deletion_blockers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_deletion_blockers() TO authenticated;
