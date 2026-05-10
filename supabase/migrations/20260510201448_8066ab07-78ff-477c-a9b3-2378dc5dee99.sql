-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-uploads', 'client-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS "Users can view their own client-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Accountants can view linked client uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own client-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own client-uploads" ON storage.objects;

-- Owner can SELECT their own files (folder = their user_id)
CREATE POLICY "Users can view their own client-uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Accountant can SELECT files belonging to their linked clients
CREATE POLICY "Accountants can view linked client uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-uploads'
  AND public.has_role(auth.uid(), 'accountant'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id::text = (storage.foldername(name))[1]
      AND p.linked_accountant_id = auth.uid()
  )
);

-- Owner can INSERT to their own folder
CREATE POLICY "Users can upload to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Owner can UPDATE their own files
CREATE POLICY "Users can update their own client-uploads"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Owner can DELETE their own files
CREATE POLICY "Users can delete their own client-uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);