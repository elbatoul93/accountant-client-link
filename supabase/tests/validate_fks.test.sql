-- 247000-style validation: after all migrations the thirteen user foreign keys are validated (CI starts from empty tables).
CREATE SCHEMA v;
CREATE FUNCTION v.eq(_actual anyelement, _expected anyelement, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN RAISE EXCEPTION '% : expected %, got %', _what, _expected, _actual; END IF;
END $$;
\o /dev/null
SELECT v.eq((SELECT count(*)::int FROM pg_constraint WHERE contype = 'f' AND NOT convalidated
  AND conname IN ('documents_user_fk', 'messages_sender_fk', 'messages_receiver_fk', 'g50_accountant_fk', 'g50_client_fk',
    'shared_documents_accountant_fk', 'shared_documents_client_fk', 'acc_invoices_accountant_fk', 'acc_declarations_accountant_fk',
    'acc_fs_accountant_fk', 'acc_shared_accountant_fk', 'acc_shared_client_user_fk', 'acc_legal_accountant_fk')), 0, 'user foreign keys validated');
SELECT v.eq((SELECT count(*)::int FROM pg_constraint WHERE contype = 'f' AND convalidated
  AND conname IN ('documents_user_fk', 'messages_sender_fk', 'messages_receiver_fk', 'g50_accountant_fk', 'g50_client_fk',
    'shared_documents_accountant_fk', 'shared_documents_client_fk', 'acc_invoices_accountant_fk', 'acc_declarations_accountant_fk',
    'acc_fs_accountant_fk', 'acc_shared_accountant_fk', 'acc_shared_client_user_fk', 'acc_legal_accountant_fk')), 13, 'all thirteen exist');
