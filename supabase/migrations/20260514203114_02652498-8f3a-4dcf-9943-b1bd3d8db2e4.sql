CREATE TABLE public.g50_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id uuid NOT NULL,
  client_id uuid NOT NULL,
  month int NOT NULL,
  year int NOT NULL,
  form_data jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_g50_declarations_client ON public.g50_declarations(client_id, year, month);
CREATE INDEX idx_g50_declarations_accountant ON public.g50_declarations(accountant_id);

ALTER TABLE public.g50_declarations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accountant select own g50"
  ON public.g50_declarations FOR SELECT
  USING (auth.uid() = accountant_id);

CREATE POLICY "Accountant insert own g50"
  ON public.g50_declarations FOR INSERT
  WITH CHECK (auth.uid() = accountant_id);

CREATE POLICY "Client select own g50"
  ON public.g50_declarations FOR SELECT
  USING (auth.uid() = client_id);
