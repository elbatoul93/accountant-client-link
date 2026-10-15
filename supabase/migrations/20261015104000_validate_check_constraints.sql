-- SEC-9 (finish): validate the five CHECK constraints that 230000 added NOT VALID.
-- Counts rows that violate each one and stops with those counts if there are any, so a failed run changes nothing
-- (a migration is one transaction). documents_path_in_own_folder matters most: a violating row is a document whose
-- file path points outside its owner's folder. Fix or remove the listed rows, then run it again.
DO $$
DECLARE
  c record;
  n bigint;
  report text := '';
BEGIN
  FOR c IN
    SELECT con.conname, con.conrelid::regclass AS tbl, pg_get_expr(con.conbin, con.conrelid) AS expr
    FROM pg_constraint con
    WHERE con.contype = 'c' AND NOT con.convalidated
      AND con.conname IN ('messages_content_len', 'g50_month_year', 'acc_shared_signature_len', 'documents_path_in_own_folder', 'documents_title_len')
    ORDER BY con.conname
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE NOT (%s)', c.tbl, c.expr) INTO n;
    IF n > 0 THEN report := report || format(' %s=%s', c.conname, n); END IF;
  END LOOP;
  IF report <> '' THEN
    RAISE EXCEPTION 'Rows violate CHECK constraints (constraint=rows):%', report;
  END IF;

  FOR c IN
    SELECT con.conname, con.conrelid::regclass AS tbl
    FROM pg_constraint con
    WHERE con.contype = 'c' AND NOT con.convalidated
      AND con.conname IN ('messages_content_len', 'g50_month_year', 'acc_shared_signature_len', 'documents_path_in_own_folder', 'documents_title_len')
    ORDER BY con.conname
  LOOP
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
