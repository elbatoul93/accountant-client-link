-- my_deletion_blockers: a G50 the accountant generated and shared holds the client's account.
-- Found on the live site: "Generate" (the G50 dialog) saves a g50_declarations row with sent = false, files the
-- declaration, locks the period and shares an acc_shared_documents row of type G50 with the client. It never writes
-- shared_documents (the PDF row of the separate "Send" step), so the 242000 check saw nothing and the client could
-- delete the account, which cascades the accountant's g50_declarations row. Now a G50 holds the client when:
--   * a g50_declarations row exists for them (whatever its sent flag: Generate is how G50s are delivered today), or
--   * an acc_shared_documents row of type G50 was shared with them: addressed to their user id, belonging to a client
--     card linked to their account, or sent to exactly their email (a null email never matches).
-- The accountant side keeps the 242000 rule (flagged sent or PDF delivered) and also counts G50s it shared.
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
  SELECT 'sent_g50', (
    SELECT count(*) FROM public.g50_declarations g
      WHERE g.client_id = auth.uid()
         OR (g.accountant_id = auth.uid()
             AND (g.sent OR EXISTS (SELECT 1 FROM public.shared_documents d WHERE d.g50_declaration_id = g.id)))
  ) + (
    SELECT count(*) FROM public.acc_shared_documents s
      WHERE s.doc_type = 'G50'
        AND (s.accountant_id = auth.uid()
             OR s.client_user_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.acc_clients c
                        WHERE c.linked_user_id = auth.uid() AND c.accountant_id = s.accountant_id AND c.client_ref = s.client_ref)
             OR (s.client_email IS NOT NULL
                 AND lower(s.client_email) = lower(coalesce((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), ''))
                 AND s.accountant_id = (SELECT p.linked_accountant_id FROM public.profiles p WHERE p.user_id = auth.uid())))
  )
  UNION ALL
  SELECT 'delivered_documents', count(*) FROM public.shared_documents d
    WHERE d.accountant_id = auth.uid() OR d.client_id = auth.uid()
  UNION ALL
  SELECT 'receipts', count(*) FROM public.payment_receipts WHERE accountant_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_deletion_blockers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_deletion_blockers() TO authenticated;
