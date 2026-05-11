-- Drop the broken accountant storage SELECT policies
DROP POLICY IF EXISTS "Accountants can view client files" ON storage.objects;
DROP POLICY IF EXISTS "Accountants can view linked client uploads" ON storage.objects;

-- Correctly let accountants read files for clients linked to them.
-- The client's auth user_id is the FIRST folder segment of the object name.
CREATE POLICY "Accountants can view linked client uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-uploads'
  AND has_role(auth.uid(), 'accountant'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id::text = (storage.foldername(storage.objects.name))[1]
      AND p.linked_accountant_id = auth.uid()
  )
);