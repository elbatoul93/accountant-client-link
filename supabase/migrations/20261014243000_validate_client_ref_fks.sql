-- SEC-15 (finish): validate the five composite client_ref foreign keys added NOT VALID in 238000.
-- Counts rows that point at a client the accountant does not have first, and stops with those counts if there are any,
-- so a failed run changes nothing (a migration is one transaction). Fix or remove the listed rows, then run it again.
DO $$
DECLARE
  t text;
  n bigint;
  report text := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['acc_invoices','acc_declarations','acc_financial_statements','acc_legal_documents','acc_shared_documents']
  LOOP
    EXECUTE format($f$SELECT count(*) FROM public.%I x
      WHERE x.accountant_id IS NOT NULL AND x.client_ref IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.acc_clients c WHERE c.accountant_id = x.accountant_id AND c.client_ref = x.client_ref)$f$, t)
      INTO n;
    IF n > 0 THEN report := report || format(' %s=%s', t, n); END IF;
  END LOOP;
  IF report <> '' THEN
    RAISE EXCEPTION 'Orphan client_ref rows block FK validation (table=rows):%', report;
  END IF;

  FOREACH t IN ARRAY ARRAY['acc_invoices','acc_declarations','acc_financial_statements','acc_legal_documents','acc_shared_documents']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_client_fk' AND conrelid = ('public.' || t)::regclass AND NOT convalidated) THEN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', t, t || '_client_fk');
    END IF;
  END LOOP;
END $$;
