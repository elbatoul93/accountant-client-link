-- IBS N-1 per client and year: tenant isolation, activation gate, cascade with the client.
CREATE SCHEMA i;
GRANT USAGE ON SCHEMA i TO PUBLIC;
CREATE FUNCTION i.as_user(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION i.as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
END $$;
CREATE FUNCTION i.as_root() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
CREATE FUNCTION i.eq(_actual anyelement, _expected anyelement, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN RAISE EXCEPTION '% : expected %, got %', _what, _expected, _actual; END IF;
END $$;
CREATE FUNCTION i.denied(_sql text, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE _sql; EXCEPTION WHEN OTHERS THEN RETURN; END;
  RAISE EXCEPTION 'expected failure but succeeded: %', _what;
END $$;
CREATE FUNCTION i.rows_affected(_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN EXECUTE _sql; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$;

\o /dev/null
\set a1  'cccccccc-0000-0000-0000-000000000001'
\set a2  'cccccccc-0000-0000-0000-000000000002'
\set a3  'cccccccc-0000-0000-0000-000000000003'
\set adm 'cccccccc-0000-0000-0000-0000000000ff'

BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  (:'a1', 'ibs1@example.com', '{"name":"A One"}'),
  (:'a2', 'ibs2@example.com', '{"name":"A Two"}'),
  (:'a3', 'ibs3@example.com', '{"name":"A Three"}'),
  (:'adm', 'ibsadmin@example.com', '{"name":"Admin"}');
INSERT INTO public.admins (user_id) VALUES (:'adm');
SELECT i.as_user(:'adm');
SELECT public.admin_set_accountant_status(:'a1', 'active');
SELECT public.admin_set_accountant_status(:'a2', 'active');
SELECT i.as_root();

-- a1 and a2 each have a client; a3 stays pending.
SELECT i.as_user(:'a1');
INSERT INTO public.acc_clients (accountant_id, client_ref, name) VALUES (:'a1', 'cl-1', 'Client One');
INSERT INTO public.acc_ibs_prior_year (accountant_id, client_ref, year, amount) VALUES (:'a1', 'cl-1', 2026, 1000000);
SELECT i.eq((SELECT amount FROM public.acc_ibs_prior_year WHERE client_ref = 'cl-1' AND year = 2026), 1000000::numeric, 'owner reads the amount');
UPDATE public.acc_ibs_prior_year SET amount = 1200000 WHERE client_ref = 'cl-1' AND year = 2026;
SELECT i.eq((SELECT amount FROM public.acc_ibs_prior_year WHERE client_ref = 'cl-1' AND year = 2026), 1200000::numeric, 'owner updates the amount');
SELECT i.denied($$INSERT INTO public.acc_ibs_prior_year (accountant_id, client_ref, year, amount) VALUES ('cccccccc-0000-0000-0000-000000000001', 'cl-1', 2027, -5)$$, 'negative amount');
SELECT i.denied($$INSERT INTO public.acc_ibs_prior_year (accountant_id, client_ref, year, amount) VALUES ('cccccccc-0000-0000-0000-000000000001', 'unknown-client', 2026, 5)$$, 'unknown client');
SELECT i.as_root();

-- other accountants see and touch nothing; nobody inserts for someone else
SELECT i.as_user(:'a2');
INSERT INTO public.acc_clients (accountant_id, client_ref, name) VALUES (:'a2', 'cl-2', 'Client Two');
SELECT i.eq((SELECT count(*)::int FROM public.acc_ibs_prior_year), 0, 'other accountant sees no rows');
SELECT i.eq(i.rows_affected($$UPDATE public.acc_ibs_prior_year SET amount = 1$$), 0::bigint, 'cross-tenant update touches no rows');
SELECT i.eq(i.rows_affected($$DELETE FROM public.acc_ibs_prior_year$$), 0::bigint, 'cross-tenant delete touches no rows');
SELECT i.denied($$INSERT INTO public.acc_ibs_prior_year (accountant_id, client_ref, year, amount) VALUES ('cccccccc-0000-0000-0000-000000000001', 'cl-1', 2030, 1)$$, 'insert for another accountant');
SELECT i.as_root();

-- pending accountant cannot write; anon cannot read
SELECT i.as_user(:'a3');
SELECT i.denied($$INSERT INTO public.acc_ibs_prior_year (accountant_id, client_ref, year, amount) VALUES ('cccccccc-0000-0000-0000-000000000003', 'x', 2026, 1)$$, 'pending accountant inserts');
SELECT i.as_root();
SELECT i.as_anon();
SELECT i.denied($$SELECT * FROM public.acc_ibs_prior_year$$, 'anon reads');
SELECT i.as_root();

-- the value goes with the client
DELETE FROM public.acc_clients WHERE accountant_id = :'a1' AND client_ref = 'cl-1';
SELECT i.eq((SELECT count(*)::int FROM public.acc_ibs_prior_year), 0, 'deleted with the client');
ROLLBACK;
