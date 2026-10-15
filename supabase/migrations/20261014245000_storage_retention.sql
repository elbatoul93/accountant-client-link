-- Retention (SEC-16), the files. 233000 and 244000 stop users deleting the rows of signed documents and delivered G50s;
-- this stops them deleting the stored files those rows point at. Restrictive DELETE policy only: uploads and updates are
-- untouched, drafts and unsigned files delete as before, and the service role (account erasure, support) bypasses RLS.
CREATE OR REPLACE FUNCTION public.storage_object_is_retained(_bucket text, _name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _bucket = 'shared-docs' THEN EXISTS (
      SELECT 1 FROM public.shared_documents d WHERE d.file_path = _name AND d.g50_declaration_id IS NOT NULL)
    WHEN _bucket = 'client-uploads' THEN EXISTS (
      SELECT 1 FROM public.acc_shared_documents s WHERE s.file_path = _name AND s.signed_at IS NOT NULL)
    ELSE false
  END
$$;
REVOKE ALL ON FUNCTION public.storage_object_is_retained(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_object_is_retained(text, text) TO authenticated;

DROP POLICY IF EXISTS "Retained files cannot be deleted" ON storage.objects;
CREATE POLICY "Retained files cannot be deleted" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.storage_object_is_retained(bucket_id, name));
