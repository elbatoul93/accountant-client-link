-- After all migrations the five SEC-9 CHECK constraints are validated (CI starts from empty tables).
CREATE SCHEMA k;
CREATE FUNCTION k.eq(_actual anyelement, _expected anyelement, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN RAISE EXCEPTION '% : expected %, got %', _what, _expected, _actual; END IF;
END $$;
\o /dev/null
SELECT k.eq((SELECT count(*)::int FROM pg_constraint WHERE contype = 'c' AND convalidated
  AND conname IN ('messages_content_len', 'g50_month_year', 'acc_shared_signature_len', 'documents_path_in_own_folder', 'documents_title_len')), 5, 'five CHECK constraints validated');
