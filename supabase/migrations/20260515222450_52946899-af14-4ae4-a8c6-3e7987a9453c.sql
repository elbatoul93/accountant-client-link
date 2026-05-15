
-- 1) Add sent flags to g50_declarations
ALTER TABLE public.g50_declarations
  ADD COLUMN IF NOT EXISTS sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- 2) Create shared_documents table
CREATE TABLE IF NOT EXISTS public.shared_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  accountant_id uuid NOT NULL,
  g50_declaration_id uuid REFERENCES public.g50_declarations(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accountant manage own shared_documents" ON public.shared_documents;
CREATE POLICY "Accountant manage own shared_documents"
  ON public.shared_documents
  FOR ALL
  TO authenticated
  USING (auth.uid() = accountant_id)
  WITH CHECK (auth.uid() = accountant_id);

DROP POLICY IF EXISTS "Client read own shared_documents" ON public.shared_documents;
CREATE POLICY "Client read own shared_documents"
  ON public.shared_documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);

CREATE INDEX IF NOT EXISTS shared_documents_client_idx ON public.shared_documents(client_id);
CREATE INDEX IF NOT EXISTS shared_documents_accountant_idx ON public.shared_documents(accountant_id);

-- 3) Storage bucket for shared docs
INSERT INTO storage.buckets (id, name, public)
VALUES ('shared-docs', 'shared-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {client_id}/{g50_declaration_id}.pdf
DROP POLICY IF EXISTS "Accountants upload shared-docs to linked clients" ON storage.objects;
CREATE POLICY "Accountants upload shared-docs to linked clients"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'shared-docs'
    AND public.is_linked_accountant(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Accountants read shared-docs of linked clients" ON storage.objects;
CREATE POLICY "Accountants read shared-docs of linked clients"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'shared-docs'
    AND public.is_linked_accountant(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Accountants delete shared-docs of linked clients" ON storage.objects;
CREATE POLICY "Accountants delete shared-docs of linked clients"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'shared-docs'
    AND public.is_linked_accountant(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Clients read own shared-docs" ON storage.objects;
CREATE POLICY "Clients read own shared-docs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'shared-docs'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
