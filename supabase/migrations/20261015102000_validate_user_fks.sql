-- SEC-15 (rest): validate the thirteen single-column foreign keys to auth.users that 230000 added NOT VALID.
-- Counts rows that point at a user that no longer exists, per constraint, and stops with those counts if there are
-- any, so a failed run changes nothing (a migration is one transaction). Fix or remove the listed rows, then run again.
DO $$
DECLARE
  c record;
  n bigint;
  report text := '';
BEGIN
  FOR c IN
    SELECT con.conname, con.conrelid::regclass AS child, a.attname AS col
    FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
    WHERE con.contype = 'f' AND NOT con.convalidated AND array_length(con.conkey, 1) = 1
      AND con.confrelid = 'auth.users'::regclass
      AND con.conname IN ('documents_user_fk', 'messages_sender_fk', 'messages_receiver_fk', 'g50_accountant_fk', 'g50_client_fk',
        'shared_documents_accountant_fk', 'shared_documents_client_fk', 'acc_invoices_accountant_fk', 'acc_declarations_accountant_fk',
        'acc_fs_accountant_fk', 'acc_shared_accountant_fk', 'acc_shared_client_user_fk', 'acc_legal_accountant_fk')
    ORDER BY con.conname
  LOOP
    EXECUTE format('SELECT count(*) FROM %s x WHERE x.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.%I)',
      c.child, c.col, c.col) INTO n;
    IF n > 0 THEN report := report || format(' %s=%s', c.conname, n); END IF;
  END LOOP;
  IF report <> '' THEN
    RAISE EXCEPTION 'Orphan rows block FK validation (constraint=rows):%', report;
  END IF;

  FOR c IN
    SELECT con.conname, con.conrelid::regclass AS child
    FROM pg_constraint con
    WHERE con.contype = 'f' AND NOT con.convalidated AND con.confrelid = 'auth.users'::regclass
      AND con.conname IN ('documents_user_fk', 'messages_sender_fk', 'messages_receiver_fk', 'g50_accountant_fk', 'g50_client_fk',
        'shared_documents_accountant_fk', 'shared_documents_client_fk', 'acc_invoices_accountant_fk', 'acc_declarations_accountant_fk',
        'acc_fs_accountant_fk', 'acc_shared_accountant_fk', 'acc_shared_client_user_fk', 'acc_legal_accountant_fk')
    ORDER BY con.conname
  LOOP
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', c.child, c.conname);
  END LOOP;
END $$;
