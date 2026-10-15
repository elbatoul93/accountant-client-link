-- Files of signed documents and delivered G50s cannot be deleted by users; other files can.
CREATE SCHEMA s;
GRANT USAGE ON SCHEMA s TO PUBLIC;
CREATE FUNCTION s.as_user(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION s.as_root() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
CREATE FUNCTION s.eq(_actual anyelement, _expected anyelement, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN RAISE EXCEPTION '% : expected %, got %', _what, _expected, _actual; END IF;
END $$;
-- Deletes the named object as the current role and returns how many rows went.
CREATE FUNCTION s.del(_name text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  DELETE FROM storage.objects WHERE name = _name;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

\o /dev/null
\set acc 'dddddddd-0000-0000-0000-000000000001'
\set cl  'dddddddd-0000-0000-0000-0000000000c1'
\set g1  'dddddddd-0000-0000-0000-0000000000d1'

BEGIN;
INSERT INTO auth.users (id, email) VALUES (:'acc', 'sacc@example.com'), (:'cl', 'scl@example.com');
UPDATE public.profiles SET user_type = 'client' WHERE user_id = :'cl';
UPDATE public.profiles SET account_status = 'active' WHERE user_id = :'acc';
INSERT INTO storage.buckets (id, name) VALUES ('client-uploads', 'client-uploads'), ('shared-docs', 'shared-docs') ON CONFLICT DO NOTHING;
INSERT INTO public.acc_clients (accountant_id, client_ref, name) VALUES (:'acc', 'ref1', 'Client One');
INSERT INTO public.acc_shared_documents (accountant_id, client_ref, client_name, doc_type, label, file_path, signed_at) VALUES
  (:'acc', 'ref1', 'Client One', 'contract', 'Signed', 'accountant-shared/dddddddd-0000-0000-0000-000000000001/ref1/signed.pdf', now()),
  (:'acc', 'ref1', 'Client One', 'contract', 'Draft', 'accountant-shared/dddddddd-0000-0000-0000-000000000001/ref1/draft.pdf', NULL);
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('client-uploads', 'accountant-shared/dddddddd-0000-0000-0000-000000000001/ref1/signed.pdf'),
  ('client-uploads', 'accountant-shared/dddddddd-0000-0000-0000-000000000001/ref1/draft.pdf'),
  ('client-uploads', 'accountant-shared/dddddddd-0000-0000-0000-000000000001/ref1/loose.pdf');
INSERT INTO public.g50_declarations (id, accountant_id, client_id, month, year, form_data, sent) VALUES (:'g1', :'acc', :'cl', 1, 2026, '{}', true);
INSERT INTO public.shared_documents (client_id, accountant_id, g50_declaration_id, file_path, title)
  VALUES (:'cl', :'acc', :'g1', 'dddddddd-0000-0000-0000-0000000000c1/g.pdf', 'G50');

-- The retention test below uses the function the policy uses (the shared-docs delete policy needs a client link
-- that the bootstrap does not model), and a real delete through RLS for the client-uploads bucket.
SELECT s.eq(public.storage_object_is_retained('shared-docs', 'dddddddd-0000-0000-0000-0000000000c1/g.pdf'), true, 'delivered G50 file is retained');
SELECT s.eq(public.storage_object_is_retained('shared-docs', 'dddddddd-0000-0000-0000-0000000000c1/other.pdf'), false, 'other shared-docs file is not');
SELECT s.eq(public.storage_object_is_retained('client-uploads', 'accountant-shared/dddddddd-0000-0000-0000-000000000001/ref1/signed.pdf'), true, 'signed document file is retained');
SELECT s.eq(public.storage_object_is_retained('client-uploads', 'accountant-shared/dddddddd-0000-0000-0000-000000000001/ref1/draft.pdf'), false, 'draft file is not');

SELECT s.as_user(:'acc');
SELECT s.eq(s.del('accountant-shared/dddddddd-0000-0000-0000-000000000001/ref1/signed.pdf'), 0::bigint, 'accountant cannot delete a signed document file');
SELECT s.eq(s.del('accountant-shared/dddddddd-0000-0000-0000-000000000001/ref1/draft.pdf'), 1::bigint, 'accountant can delete a draft file');
SELECT s.eq(s.del('accountant-shared/dddddddd-0000-0000-0000-000000000001/ref1/loose.pdf'), 1::bigint, 'accountant can delete an unreferenced file');
SELECT s.as_root();
SELECT s.eq(s.del('accountant-shared/dddddddd-0000-0000-0000-000000000001/ref1/signed.pdf'), 1::bigint, 'service role can still delete it');
ROLLBACK;
