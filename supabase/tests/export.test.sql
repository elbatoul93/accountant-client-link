-- export_my_data includes the caller's rows from every user-data table, and erasing the account removes them.
CREATE SCHEMA x;
GRANT USAGE ON SCHEMA x TO PUBLIC;
CREATE FUNCTION x.as_user(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION x.as_root() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
CREATE FUNCTION x.eq(_actual anyelement, _expected anyelement, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN RAISE EXCEPTION '% : expected %, got %', _what, _expected, _actual; END IF;
END $$;

\o /dev/null
\set acc 'eeeeeeee-0000-0000-0000-000000000001'
BEGIN;
INSERT INTO auth.users (id, email) VALUES (:'acc', 'xacc@example.com');
UPDATE public.profiles SET account_status = 'active' WHERE user_id = :'acc';
INSERT INTO public.acc_clients (accountant_id, client_ref, name) VALUES (:'acc', 'ref1', 'Client One');
INSERT INTO public.acc_ibs_prior_year (accountant_id, client_ref, year, amount) VALUES (:'acc', 'ref1', 2026, 125000);

SELECT x.as_user(:'acc');
SELECT x.eq(jsonb_array_length(public.export_my_data() -> 'acc_ibs_prior_year'), 1, 'export includes the IBS N-1 rows');
SELECT x.eq(jsonb_array_length(public.export_my_data() -> 'acc_clients'), 1, 'export includes clients');
SELECT x.as_root();
DELETE FROM auth.users WHERE id = :'acc';
SELECT x.eq((SELECT count(*)::int FROM public.acc_ibs_prior_year WHERE accountant_id = :'acc'), 0, 'erasing the account removes the IBS N-1 rows');
ROLLBACK;
