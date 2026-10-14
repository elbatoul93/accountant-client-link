-- Follow-up to 20261014200000_harden_rls_invites_profiles.sql (launch audit items 2, 6, 7).
-- Remaining gaps: linked clients could read every document of their accountant
-- (including documents addressed to other clients), and accountants could address
-- shared documents to any registered user's email.

-- 1) Helper: may the current accountant address documents to this email?
--    Allowed when the email is empty, belongs to one of their linked clients,
--    or belongs to nobody registered (client not signed up yet).
CREATE OR REPLACE FUNCTION public.can_address_email(_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _email IS NULL OR _email = ''
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE lower(p.email) = lower(_email) AND p.linked_accountant_id = auth.uid()
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE lower(p.email) = lower(_email)
    );
$$;

REVOKE ALL ON FUNCTION public.can_address_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_address_email(text) TO authenticated;

-- 2) Accountant insert/update: client_user_id and client_email must be addressable.
DROP POLICY IF EXISTS "Accountant insert own shared" ON public.acc_shared_documents;
CREATE POLICY "Accountant insert own shared"
  ON public.acc_shared_documents FOR INSERT
  WITH CHECK (
    auth.uid() = accountant_id
    AND (client_user_id IS NULL OR public.is_linked_accountant(client_user_id))
    AND public.can_address_email(client_email)
  );

DROP POLICY IF EXISTS "Accountant update own shared" ON public.acc_shared_documents;
CREATE POLICY "Accountant update own shared"
  ON public.acc_shared_documents FOR UPDATE
  USING (auth.uid() = accountant_id)
  WITH CHECK (
    auth.uid() = accountant_id
    AND (client_user_id IS NULL OR public.is_linked_accountant(client_user_id))
    AND public.can_address_email(client_email)
  );

-- 3) Linked clients see their accountant's documents only when the document is
--    not addressed to somebody else.
DROP POLICY IF EXISTS "Client select shared from their accountant" ON public.acc_shared_documents;
CREATE POLICY "Client select shared from their accountant"
  ON public.acc_shared_documents FOR SELECT
  USING (
    accountant_id = public.get_my_linked_accountant_id()
    AND (client_user_id IS NULL OR client_user_id = auth.uid())
    AND (
      client_email IS NULL
      OR lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- 4) Storage: a linked client may read an accountant-shared file only if they can
--    see the acc_shared_documents row that references it (RLS applies to the subquery).
DROP POLICY IF EXISTS "Client read shared files from linked accountant" ON storage.objects;
CREATE POLICY "Client read shared files from linked accountant" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'client-uploads'
    AND (storage.foldername(name))[1] = 'accountant-shared'
    AND EXISTS (
      SELECT 1 FROM public.acc_shared_documents d WHERE d.file_path = storage.objects.name
    )
  );

NOTIFY pgrst, 'reload schema';
