-- Supabase advisor fixes (security + performance), 2026-10-14.

-- 1) Policies: evaluate auth.uid() and our per-user helper functions once per statement, not once per row
--    (advisor auth_rls_initplan, 115 findings). Rewrites every policy in public and the storage.objects policies,
--    keeping name, command, roles and permissive/restrictive. Skips expressions that are already wrapped.
DO $$
DECLARE
  p record;
  q text; w text;
  fn text;
  fns text[] := ARRAY['auth.uid()', 'public.is_active_accountant()', 'public.subscription_read_only()',
                      'public.is_admin()', 'public.get_my_linked_accountant_id()'];
  stmt text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' OR (schemaname = 'storage' AND tablename = 'objects')
  LOOP
    q := p.qual; w := p.with_check;
    FOREACH fn IN ARRAY fns LOOP
      -- pg_policies prints calls schema-qualified for non-public functions only; handle both spellings.
      IF q IS NOT NULL THEN
        q := regexp_replace(q, '(?<!SELECT )(?<!select )' || replace(replace(fn, '(', '\('), ')', '\)'), '(SELECT ' || fn || ')', 'g');
        q := regexp_replace(q, '(?<!SELECT )(?<!select )(?<![.\w])' || replace(replace(replace(fn, 'public.', ''), '(', '\('), ')', '\)'), '(SELECT ' || fn || ')', 'g');
      END IF;
      IF w IS NOT NULL THEN
        w := regexp_replace(w, '(?<!SELECT )(?<!select )' || replace(replace(fn, '(', '\('), ')', '\)'), '(SELECT ' || fn || ')', 'g');
        w := regexp_replace(w, '(?<!SELECT )(?<!select )(?<![.\w])' || replace(replace(replace(fn, 'public.', ''), '(', '\('), ')', '\)'), '(SELECT ' || fn || ')', 'g');
      END IF;
    END LOOP;
    IF q IS DISTINCT FROM p.qual OR w IS DISTINCT FROM p.with_check THEN
      stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
      IF q IS NOT NULL THEN stmt := stmt || ' USING (' || q || ')'; END IF;
      IF w IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || w || ')'; END IF;
      EXECUTE stmt;
    END IF;
  END LOOP;
END $$;

-- 2) Foreign keys without a covering index (advisor unindexed_foreign_keys).
CREATE INDEX IF NOT EXISTS acc_checklist_ref_document_idx ON public.acc_checklist (ref_document_id);
CREATE INDEX IF NOT EXISTS acc_payroll_runs_client_idx ON public.acc_payroll_runs (accountant_id, client_ref);
CREATE INDEX IF NOT EXISTS acc_payslips_employee_idx ON public.acc_payslips (employee_id);
CREATE INDEX IF NOT EXISTS acc_period_locks_client_idx ON public.acc_period_locks (accountant_id, client_ref);
CREATE INDEX IF NOT EXISTS invitations_used_by_idx ON public.invitations (used_by);
CREATE INDEX IF NOT EXISTS messages_ref_doc_idx ON public.messages (ref_doc_id);
CREATE INDEX IF NOT EXISTS notifications_sender_idx ON public.notifications (sender_id);
CREATE INDEX IF NOT EXISTS shared_documents_g50_idx ON public.shared_documents (g50_declaration_id);

-- 3) Function exposure (advisor *_security_definer_function_executable).
--    get_invitation_by_token stays callable by anon on purpose: the invite page reads it before sign-in.
--    The RLS helpers (has_role, is_linked_accountant, is_my_client_ref, can_address_email,
--    get_my_linked_accountant_id) must stay executable by authenticated because policies call them as the user.
REVOKE ALL ON FUNCTION public.get_linked_client_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_linked_client_names() TO authenticated;
-- rls_auto_enable is an event-trigger helper; nobody should call it through the API.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- 4) admins: RLS on with no policy is intentional (readable only through is_admin()); make it explicit.
DROP POLICY IF EXISTS "No direct access to admins" ON public.admins;
CREATE POLICY "No direct access to admins" ON public.admins FOR ALL TO authenticated USING (false) WITH CHECK (false);
