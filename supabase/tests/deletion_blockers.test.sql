-- my_deletion_blockers: what holds an account back from self-service deletion.
CREATE SCHEMA d;
GRANT USAGE ON SCHEMA d TO PUBLIC;
CREATE FUNCTION d.as_user(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
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

BEGIN;
INSERT INTO auth.users (id, email) VALUES (:'acc', 'acc@example.com'), (:'c1', 'c1@example.com'), (:'c2', 'c2@example.com'), (:'c3', 'c3@example.com');

-- c1: G50 PDF delivered through shared_documents but the sent flag never flipped (send stopped half-way).
-- c2: G50 flagged sent, no PDF row.  c3: nothing at all.
INSERT INTO public.g50_declarations (id, accountant_id, client_id, month, year, form_data, sent)
  VALUES ('bbbbbbbb-0000-0000-0000-0000000000d1', :'acc', :'c1', 1, 2026, '{}', false);
INSERT INTO public.shared_documents (client_id, accountant_id, g50_declaration_id, file_path, title)
  VALUES (:'c1', :'acc', 'bbbbbbbb-0000-0000-0000-0000000000d1', 'c1/d1.pdf', 'G50 01/2026');
INSERT INTO public.g50_declarations (accountant_id, client_id, month, year, form_data, sent, sent_at)
  VALUES (:'acc', :'c2', 1, 2026, '{}', true, now());

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
