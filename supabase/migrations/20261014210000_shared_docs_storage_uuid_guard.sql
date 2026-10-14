-- Avoid ::uuid cast errors on non-UUID folder names in shared-docs storage policies.
DROP POLICY IF EXISTS "Accountants upload shared-docs to linked clients" ON storage.objects;
CREATE POLICY "Accountants upload shared-docs to linked clients"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'shared-docs'
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
         THEN public.is_linked_accountant(((storage.foldername(name))[1])::uuid) ELSE false END
  );

DROP POLICY IF EXISTS "Accountants read shared-docs of linked clients" ON storage.objects;
CREATE POLICY "Accountants read shared-docs of linked clients"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'shared-docs'
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
         THEN public.is_linked_accountant(((storage.foldername(name))[1])::uuid) ELSE false END
  );

DROP POLICY IF EXISTS "Accountants delete shared-docs of linked clients" ON storage.objects;
CREATE POLICY "Accountants delete shared-docs of linked clients"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'shared-docs'
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
         THEN public.is_linked_accountant(((storage.foldername(name))[1])::uuid) ELSE false END
  );
