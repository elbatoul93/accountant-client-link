-- my_deletion_blockers: what holds an account back from self-service deletion.
CREATE SCHEMA d;
GRANT USAGE ON SCHEMA d TO PUBLIC;
CREATE FUNCTION d.as_user(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
-- Same as as_user, with the email claim the real JWT carries.
CREATE FUNCTION d.as_user_email(_uid uuid, _email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'email', _email)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION d.as_root() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
CREATE FUNCTION d.eq(_actual anyelement, _expected anyelement, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN RAISE EXCEPTION '% : expected %, got %', _what, _expected, _actual; END IF;
END $$;
CREATE FUNCTION d.blocker(_kind text) RETURNS bigint LANGUAGE sql AS $$
  SELECT coalesce((SELECT n FROM public.my_deletion_blockers() WHERE kind = _kind), 0)
$$;

\o /dev/null
\set acc 'bbbbbbbb-0000-0000-0000-000000000001'
\set c1  'bbbbbbbb-0000-0000-0000-0000000000c1'
\set c2  'bbbbbbbb-0000-0000-0000-0000000000c2'
\set c3  'bbbbbbbb-0000-0000-0000-0000000000c3'
\set c4  'bbbbbbbb-0000-0000-0000-0000000000c4'
\set c5  'bbbbbbbb-0000-0000-0000-0000000000c5'
\set c6  'bbbbbbbb-0000-0000-0000-0000000000c6'
\set c7  'bbbbbbbb-0000-0000-0000-0000000000c7'

BEGIN;
INSERT INTO auth.users (id, email) VALUES (:'acc', 'acc@example.com'), (:'c1', 'c1@example.com'), (:'c2', 'c2@example.com'), (:'c3', 'c3@example.com'),
  (:'c4', 'c4@example.com'), (:'c5', 'c5@example.com'), (:'c6', 'c6@example.com'), (:'c7', 'c7@example.com');

-- c1: G50 PDF delivered through shared_documents but the sent flag never flipped (send stopped half-way).
-- c2: G50 flagged sent, no PDF row.  c3: nothing at all.
INSERT INTO public.g50_declarations (id, accountant_id, client_id, month, year, form_data, sent)
  VALUES ('bbbbbbbb-0000-0000-0000-0000000000d1', :'acc', :'c1', 1, 2026, '{}', false);
INSERT INTO public.shared_documents (client_id, accountant_id, g50_declaration_id, file_path, title)
  VALUES (:'c1', :'acc', 'bbbbbbbb-0000-0000-0000-0000000000d1', 'c1/d1.pdf', 'G50 01/2026');
INSERT INTO public.g50_declarations (accountant_id, client_id, month, year, form_data, sent, sent_at)
  VALUES (:'acc', :'c2', 1, 2026, '{}', true, now());

-- Generate-only G50 (what the G50 dialog writes): c4 has an unsent g50_declarations row and no PDF; c5 is reached
-- through a shared G50 on their linked client card; c6 through a shared G50 sent to their email; c7 has a shared
-- G50 for another email and nothing else.
INSERT INTO public.g50_declarations (accountant_id, client_id, month, year, form_data, sent)
  VALUES (:'acc', :'c4', 1, 2026, '{}', false);
INSERT INTO public.acc_clients (accountant_id, client_ref, name, linked_user_id) VALUES (:'acc', 'ref5', 'Client Five', :'c5');
INSERT INTO public.acc_shared_documents (accountant_id, client_ref, client_name, doc_type, label)
  VALUES (:'acc', 'ref5', 'Client Five', 'G50', 'G50 2026-10');
INSERT INTO public.acc_clients (accountant_id, client_ref, name) VALUES (:'acc', 'ref6', 'Client Six'), (:'acc', 'ref7', 'Client Seven');
UPDATE public.profiles SET linked_accountant_id = :'acc' WHERE user_id IN (:'c6', :'c7');
INSERT INTO public.acc_shared_documents (accountant_id, client_ref, client_name, client_email, doc_type, label) VALUES
  (:'acc', 'ref6', 'Client Six', 'c6@example.com', 'G50', 'G50 2026-10'),
  (:'acc', 'ref7', 'Client Seven', 'someone-else@example.com', 'G50', 'G50 2026-10');

SELECT d.as_user(:'c4');
SELECT d.eq(d.blocker('sent_g50') > 0, true, 'c4: a generated G50 (unsent row, no PDF) holds the account');
SELECT d.as_root();
SELECT d.as_user(:'c5');
SELECT d.eq(d.blocker('sent_g50') > 0, true, 'c5: a G50 shared on their linked client card holds the account');
SELECT d.as_root();
SELECT d.as_user_email(:'c6', 'c6@example.com');
SELECT d.eq(d.blocker('sent_g50') > 0, true, 'c6: a G50 shared to their email holds the account');
SELECT d.as_root();
SELECT d.as_user_email(:'c7', 'c7@example.com');
SELECT d.eq(d.blocker('sent_g50'), 0::bigint, 'c7: a G50 shared to somebody else does not');
SELECT d.as_root();

SELECT d.as_user(:'c1');
SELECT d.eq(d.blocker('sent_g50') > 0, true, 'c1: delivered G50 holds the account');
SELECT d.eq(d.blocker('delivered_documents') > 0, true, 'c1: delivered document holds the account');
SELECT d.as_root();
SELECT d.as_user(:'c2');
SELECT d.eq(d.blocker('sent_g50') > 0, true, 'c2: flagged-sent G50 holds the account');
SELECT d.eq(d.blocker('delivered_documents'), 0::bigint, 'c2: no delivered document');
SELECT d.as_root();
SELECT d.as_user(:'c3');
SELECT d.eq((SELECT count(*)::int FROM public.my_deletion_blockers() WHERE n > 0), 0, 'c3: nothing holds the account');
SELECT d.as_root();
SELECT d.as_user(:'acc');
SELECT d.eq(d.blocker('sent_g50') >= 2, true, 'accountant: both G50s hold the account');
SELECT d.as_root();
ROLLBACK;
