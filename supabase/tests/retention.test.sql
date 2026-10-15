-- Retention for accountants: a delivered G50 cannot be erased or un-sent by the accountant; support (no user) still can.
CREATE SCHEMA r;
GRANT USAGE ON SCHEMA r TO PUBLIC;
CREATE FUNCTION r.as_user(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION r.as_root() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
-- Runs a statement as the current role and returns the error text, or '' if it succeeded.
CREATE FUNCTION r.try(_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN '';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;
CREATE FUNCTION r.expect(_err text, _like text, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _err NOT LIKE _like THEN RAISE EXCEPTION '% : expected error like %, got "%"', _what, _like, _err; END IF;
END $$;

\o /dev/null
\set acc 'cccccccc-0000-0000-0000-000000000001'
\set cl  'cccccccc-0000-0000-0000-0000000000c1'
\set g1  'cccccccc-0000-0000-0000-0000000000d1'
\set g2  'cccccccc-0000-0000-0000-0000000000d2'
\set g3  'cccccccc-0000-0000-0000-0000000000d3'

BEGIN;
INSERT INTO auth.users (id, email) VALUES (:'acc', 'racc@example.com'), (:'cl', 'rcl@example.com');
-- g1: sent with its PDF.  g2: draft, never sent.  g3: PDF delivered but the sent flag never flipped.
INSERT INTO public.g50_declarations (id, accountant_id, client_id, month, year, form_data, sent, sent_at) VALUES
  (:'g1', :'acc', :'cl', 1, 2026, '{}', true, now()),
  (:'g2', :'acc', :'cl', 2, 2026, '{}', false, NULL),
  (:'g3', :'acc', :'cl', 3, 2026, '{}', false, NULL);
INSERT INTO public.shared_documents (id, client_id, accountant_id, g50_declaration_id, file_path, title) VALUES
  ('cccccccc-0000-0000-0000-0000000000e1', :'cl', :'acc', :'g1', 'cl/g1.pdf', 'G50 01/2026'),
  ('cccccccc-0000-0000-0000-0000000000e3', :'cl', :'acc', :'g3', 'cl/g3.pdf', 'G50 03/2026');

SELECT r.as_user(:'acc');
SELECT r.expect(r.try($q$DELETE FROM public.shared_documents WHERE id = 'cccccccc-0000-0000-0000-0000000000e1'$q$), '%cannot be deleted%', 'delivered G50 PDF row');
SELECT r.expect(r.try($q$UPDATE public.shared_documents SET g50_declaration_id = NULL WHERE id = 'cccccccc-0000-0000-0000-0000000000e1'$q$), '%cannot be changed%', 'detach delivered PDF');
SELECT r.expect(r.try($q$UPDATE public.g50_declarations SET sent = false WHERE id = 'cccccccc-0000-0000-0000-0000000000d1'$q$), '%not sent%', 'un-send a G50');
SELECT r.expect(r.try($q$DELETE FROM public.g50_declarations WHERE id = 'cccccccc-0000-0000-0000-0000000000d1'$q$), '%cannot be deleted%', 'delete a sent G50');
SELECT r.expect(r.try($q$DELETE FROM public.g50_declarations WHERE id = 'cccccccc-0000-0000-0000-0000000000d3'$q$), '%cannot be deleted%', 'delete a G50 whose PDF was delivered');
-- A draft that was never sent still deletes, and a draft can still be sent.
SELECT r.expect(r.try($q$UPDATE public.g50_declarations SET sent = true, sent_at = now() WHERE id = 'cccccccc-0000-0000-0000-0000000000d2'$q$), '', 'send a draft');
SELECT r.as_root();
UPDATE public.g50_declarations SET sent = false, sent_at = NULL WHERE id = :'g2';
SELECT r.as_user(:'acc');
SELECT r.expect(r.try($q$DELETE FROM public.g50_declarations WHERE id = 'cccccccc-0000-0000-0000-0000000000d2'$q$), '', 'delete an unsent draft');
SELECT r.as_root();
-- Support (no signed-in user) can still erase.
SELECT r.expect(r.try($q$DELETE FROM public.shared_documents WHERE id = 'cccccccc-0000-0000-0000-0000000000e1'$q$), '', 'support deletes a delivered PDF row');
SELECT r.expect(r.try($q$DELETE FROM public.g50_declarations WHERE id = 'cccccccc-0000-0000-0000-0000000000d1'$q$), '', 'support deletes a sent G50');
ROLLBACK;
