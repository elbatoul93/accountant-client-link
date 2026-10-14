-- Regenerating a G50 PDF uploads with upsert: true, which needs an UPDATE policy on the object
-- (only INSERT/SELECT/DELETE existed, so a second generation for the same declaration failed).
DROP POLICY IF EXISTS "Accountants update shared-docs of linked clients" ON storage.objects;
CREATE POLICY "Accountants update shared-docs of linked clients"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'shared-docs'
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
         THEN public.is_linked_accountant(((storage.foldername(name))[1])::uuid) ELSE false END
  )
  WITH CHECK (
    bucket_id = 'shared-docs'
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
         THEN public.is_linked_accountant(((storage.foldername(name))[1])::uuid) ELSE false END
  );
