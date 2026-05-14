-- Tables for accountant-side data previously kept in localStorage
CREATE TABLE public.acc_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL,
  client_ref text NOT NULL,
  client_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acc_invoices_accountant_idx ON public.acc_invoices(accountant_id);

CREATE TABLE public.acc_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL,
  client_ref text NOT NULL,
  client_name text NOT NULL,
  decl_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'upcoming',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acc_declarations_accountant_idx ON public.acc_declarations(accountant_id);

CREATE TABLE public.acc_financial_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL,
  client_ref text NOT NULL,
  client_name text NOT NULL,
  fiscal_year text NOT NULL,
  assets numeric NOT NULL DEFAULT 0,
  liabilities numeric NOT NULL DEFAULT 0,
  equity numeric NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  net_result numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acc_fs_accountant_idx ON public.acc_financial_statements(accountant_id);

CREATE TABLE public.acc_shared_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL,
  client_ref text NOT NULL,
  client_user_id uuid,
  client_name text NOT NULL,
  client_email text,
  doc_type text NOT NULL,
  label text NOT NULL,
  doc_date date,
  payload text,
  file_name text,
  mime_type text,
  file_path text,
  signed_at timestamptz,
  signed_by text,
  signature_data_url text,
  workflow jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acc_shared_accountant_idx ON public.acc_shared_documents(accountant_id);
CREATE INDEX acc_shared_client_user_idx ON public.acc_shared_documents(client_user_id);
CREATE INDEX acc_shared_client_email_idx ON public.acc_shared_documents(client_email);

CREATE TABLE public.acc_legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL,
  client_ref text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL,
  file_name text,
  mime_type text,
  file_path text,
  doc_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acc_legal_accountant_idx ON public.acc_legal_documents(accountant_id);

-- Updated_at triggers
CREATE TRIGGER acc_invoices_set_updated BEFORE UPDATE ON public.acc_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER acc_declarations_set_updated BEFORE UPDATE ON public.acc_declarations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER acc_fs_set_updated BEFORE UPDATE ON public.acc_financial_statements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER acc_shared_set_updated BEFORE UPDATE ON public.acc_shared_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER acc_legal_set_updated BEFORE UPDATE ON public.acc_legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.acc_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acc_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acc_financial_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acc_shared_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acc_legal_documents ENABLE ROW LEVEL SECURITY;

-- Accountant CRUD on own rows for all 5 tables
CREATE POLICY "Accountant select own invoices" ON public.acc_invoices FOR SELECT USING (auth.uid() = accountant_id);
CREATE POLICY "Accountant insert own invoices" ON public.acc_invoices FOR INSERT WITH CHECK (auth.uid() = accountant_id);
CREATE POLICY "Accountant update own invoices" ON public.acc_invoices FOR UPDATE USING (auth.uid() = accountant_id);
CREATE POLICY "Accountant delete own invoices" ON public.acc_invoices FOR DELETE USING (auth.uid() = accountant_id);

CREATE POLICY "Accountant select own declarations" ON public.acc_declarations FOR SELECT USING (auth.uid() = accountant_id);
CREATE POLICY "Accountant insert own declarations" ON public.acc_declarations FOR INSERT WITH CHECK (auth.uid() = accountant_id);
CREATE POLICY "Accountant update own declarations" ON public.acc_declarations FOR UPDATE USING (auth.uid() = accountant_id);
CREATE POLICY "Accountant delete own declarations" ON public.acc_declarations FOR DELETE USING (auth.uid() = accountant_id);

CREATE POLICY "Accountant select own fs" ON public.acc_financial_statements FOR SELECT USING (auth.uid() = accountant_id);
CREATE POLICY "Accountant insert own fs" ON public.acc_financial_statements FOR INSERT WITH CHECK (auth.uid() = accountant_id);
CREATE POLICY "Accountant update own fs" ON public.acc_financial_statements FOR UPDATE USING (auth.uid() = accountant_id);
CREATE POLICY "Accountant delete own fs" ON public.acc_financial_statements FOR DELETE USING (auth.uid() = accountant_id);

CREATE POLICY "Accountant select own shared" ON public.acc_shared_documents FOR SELECT USING (auth.uid() = accountant_id);
CREATE POLICY "Accountant insert own shared" ON public.acc_shared_documents FOR INSERT WITH CHECK (auth.uid() = accountant_id);
CREATE POLICY "Accountant update own shared" ON public.acc_shared_documents FOR UPDATE USING (auth.uid() = accountant_id);
CREATE POLICY "Accountant delete own shared" ON public.acc_shared_documents FOR DELETE USING (auth.uid() = accountant_id);

CREATE POLICY "Accountant select own legal" ON public.acc_legal_documents FOR SELECT USING (auth.uid() = accountant_id);
CREATE POLICY "Accountant insert own legal" ON public.acc_legal_documents FOR INSERT WITH CHECK (auth.uid() = accountant_id);
CREATE POLICY "Accountant update own legal" ON public.acc_legal_documents FOR UPDATE USING (auth.uid() = accountant_id);
CREATE POLICY "Accountant delete own legal" ON public.acc_legal_documents FOR DELETE USING (auth.uid() = accountant_id);

-- Linked client can SELECT shared documents addressed to them (by user_id, by email, or by their accountant)
CREATE POLICY "Client select shared by user_id" ON public.acc_shared_documents FOR SELECT
  USING (client_user_id = auth.uid());
CREATE POLICY "Client select shared by email" ON public.acc_shared_documents FOR SELECT
  USING (client_email IS NOT NULL AND lower(client_email) = lower(coalesce((auth.jwt() ->> 'email'), '')));
CREATE POLICY "Client select shared from their accountant" ON public.acc_shared_documents FOR SELECT
  USING (accountant_id IN (SELECT linked_accountant_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Client update signature on shared" ON public.acc_shared_documents FOR UPDATE
  USING (client_user_id = auth.uid() OR (client_email IS NOT NULL AND lower(client_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))))
  WITH CHECK (client_user_id = auth.uid() OR (client_email IS NOT NULL AND lower(client_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))));

-- Storage: reuse client-uploads bucket. Path layout for accountant docs:
--   accountant-shared/{accountant_id}/{client_ref}/{filename}
--   accountant-legal/{accountant_id}/{client_ref}/{filename}
CREATE POLICY "Accountant manage own shared files" ON storage.objects
  FOR ALL USING (
    bucket_id = 'client-uploads'
    AND (storage.foldername(name))[1] IN ('accountant-shared','accountant-legal')
    AND (storage.foldername(name))[2] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'client-uploads'
    AND (storage.foldername(name))[1] IN ('accountant-shared','accountant-legal')
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Client read shared files from linked accountant" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'client-uploads'
    AND (storage.foldername(name))[1] = 'accountant-shared'
    AND (storage.foldername(name))[2] IN (
      SELECT linked_accountant_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );