-- Signup, invite, activation and row-level-security behaviour, on plain PostgreSQL.
-- Each check raises on failure (psql runs with ON_ERROR_STOP). Runs as superuser; "as_user"
-- switches to the authenticated role with a JWT subject, like PostgREST does.
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO PUBLIC;

CREATE FUNCTION t.as_user(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION t.as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
END $$;
CREATE FUNCTION t.as_root() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
-- Runs a statement and asserts that it fails (any error, e.g. RLS or trigger).
CREATE FUNCTION t.denied(_sql text, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  RAISE EXCEPTION 'expected failure but succeeded: %', _what;
END $$;
CREATE FUNCTION t.eq(_actual anyelement, _expected anyelement, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION '% : expected %, got %', _what, _expected, _actual;
  END IF;
END $$;

CREATE FUNCTION t.rows_affected(_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE _sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

\o /dev/null

-- Fixed ids
\set acc1 '11111111-1111-1111-1111-111111111111'
\set acc2 '22222222-2222-2222-2222-222222222222'
\set cli1 '33333333-3333-3333-3333-333333333333'
\set cli2 '44444444-4444-4444-4444-444444444444'
\set adm  '99999999-9999-9999-9999-999999999999'

BEGIN;

-- 1) Self-signup without an invite creates a PENDING accountant ------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  (:'acc1', 'acc1@example.com', '{"name":"Acc One"}'),
  (:'acc2', 'acc2@example.com', '{"name":"Acc Two"}'),
  (:'adm',  'admin@example.com', '{"name":"Admin"}');
SELECT t.eq((SELECT user_type::text FROM public.profiles WHERE user_id = :'acc1'), 'accountant', 'signup role');
SELECT t.eq((SELECT account_status FROM public.profiles WHERE user_id = :'acc1'), 'pending', 'signup status');
SELECT t.eq((SELECT count(*)::int FROM public.user_roles WHERE user_id = :'acc1' AND role = 'accountant'), 1, 'user_roles row');

-- 2) A pending accountant cannot create business data or invitations ---------------------------
SELECT t.as_user(:'acc1');
SELECT t.denied($$INSERT INTO public.acc_clients (accountant_id, name) VALUES ('11111111-1111-1111-1111-111111111111','X')$$, 'pending accountant inserts client');
SELECT t.denied($$INSERT INTO public.invitations (token, accountant_id) VALUES ('tok-pending','11111111-1111-1111-1111-111111111111')$$, 'pending accountant creates invite');
SELECT t.denied($$UPDATE public.profiles SET account_status = 'active' WHERE user_id = '11111111-1111-1111-1111-111111111111'$$, 'self-activation');
SELECT t.as_root();

-- 3) An admin activates accountants; non-admins cannot --------------------------------------------
INSERT INTO public.admins (user_id) VALUES (:'adm');
SELECT t.as_user(:'acc2');
SELECT t.denied($$SELECT public.admin_set_accountant_status('22222222-2222-2222-2222-222222222222','active')$$, 'non-admin activates');
SELECT t.as_root();
SELECT t.as_user(:'adm');
SELECT public.admin_set_accountant_status(:'acc1', 'active');
SELECT public.admin_set_accountant_status(:'acc2', 'active');
SELECT t.as_root();
SELECT t.eq((SELECT account_status FROM public.profiles WHERE user_id = :'acc1'), 'active', 'activated');

-- 4) Invite -> client signup -> login-ready profile -------------------------------------------------
SELECT t.as_user(:'acc1');
INSERT INTO public.invitations (token, accountant_id, email) VALUES ('tok-1', :'acc1', 'client1@example.com');
INSERT INTO public.acc_clients (accountant_id, name) VALUES (:'acc1', 'Client One Ltd');
SELECT t.as_root();

SELECT t.as_anon();
SELECT t.eq((SELECT count(*)::int FROM public.invitations), 0, 'anon sees no invitation rows');
SELECT t.eq((SELECT count(*)::int FROM public.get_invitation_by_token('tok-1')), 1, 'anon validates a token by RPC');
SELECT t.eq((SELECT count(*)::int FROM public.get_invitation_by_token('nope')), 0, 'unknown token');
SELECT t.as_root();

-- wrong email, bogus token and reused token are all rejected
SELECT t.denied($$INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('55555555-5555-5555-5555-555555555555','intruder@example.com','{"invite_token":"tok-1"}')$$, 'invite used with another email');
SELECT t.denied($$INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('55555555-5555-5555-5555-555555555555','client1@example.com','{"invite_token":"bogus"}')$$, 'bogus invite token');

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (:'cli1', 'client1@example.com', '{"invite_token":"tok-1","name":"Client One"}');
SELECT t.eq((SELECT user_type::text FROM public.profiles WHERE user_id = :'cli1'), 'client', 'invited signup is a client');
SELECT t.eq((SELECT linked_accountant_id FROM public.profiles WHERE user_id = :'cli1'), :'acc1'::uuid, 'client linked to inviter');
SELECT t.eq((SELECT account_status FROM public.profiles WHERE user_id = :'cli1'), 'active', 'client is active');
SELECT t.eq((SELECT used FROM public.invitations WHERE token = 'tok-1'), true, 'invite marked used');
SELECT t.denied($$INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('55555555-5555-5555-5555-555555555555','client1@example.com','{"invite_token":"tok-1"}')$$, 'reused invite token');

-- second client for isolation checks (invited by acc2)
SELECT t.as_user(:'acc2');
INSERT INTO public.invitations (token, accountant_id) VALUES ('tok-2', :'acc2');
SELECT t.as_root();
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (:'cli2', 'client2@example.com', '{"invite_token":"tok-2"}');

-- 5) Clients cannot escalate or re-link themselves ----------------------------------------------------
SELECT t.as_user(:'cli1');
SELECT t.denied($$UPDATE public.profiles SET user_type = 'accountant' WHERE user_id = '33333333-3333-3333-3333-333333333333'$$, 'client becomes accountant');
SELECT t.denied($$UPDATE public.profiles SET linked_accountant_id = '22222222-2222-2222-2222-222222222222' WHERE user_id = '33333333-3333-3333-3333-333333333333'$$, 'client re-links to another accountant');
SELECT t.denied($$UPDATE public.profiles SET account_status = 'suspended' WHERE user_id = '33333333-3333-3333-3333-333333333333'$$, 'client edits status');
SELECT t.denied($$INSERT INTO public.user_roles (user_id, role) VALUES ('33333333-3333-3333-3333-333333333333','accountant')$$, 'client grants itself a role');
SELECT t.denied($$INSERT INTO public.admins (user_id) VALUES ('33333333-3333-3333-3333-333333333333')$$, 'client makes itself admin');
SELECT t.as_root();

-- 6) Tenant isolation ----------------------------------------------------------------------------------
SELECT t.as_user(:'acc2');
SELECT t.eq((SELECT count(*)::int FROM public.acc_clients), 0, 'accountant 2 cannot see accountant 1 clients');
SELECT t.eq(t.rows_affected($$UPDATE public.acc_clients SET name = 'hacked'$$), 0::bigint, 'cross-tenant update touches no rows');
SELECT t.eq(t.rows_affected($$DELETE FROM public.acc_clients$$), 0::bigint, 'cross-tenant delete touches no rows');
SELECT t.as_root();
SELECT t.as_user(:'acc1');
SELECT t.eq((SELECT count(*)::int FROM public.acc_clients), 1, 'accountant 1 sees own client');
SELECT t.eq((SELECT count(*)::int FROM public.profiles WHERE user_id = :'cli2'), 0, 'accountant 1 cannot see unlinked client profile');
SELECT t.as_root();
SELECT t.as_user(:'cli2');
SELECT t.eq((SELECT count(*)::int FROM public.profiles WHERE user_id = :'cli1'), 0, 'client 2 cannot read client 1 profile');
SELECT t.eq((SELECT count(*)::int FROM public.acc_clients), 0, 'client 2 sees no accountant rows of others');
SELECT t.as_root();

-- 7) A suspended accountant loses access --------------------------------------------------------------
SELECT t.as_user(:'adm');
SELECT public.admin_set_accountant_status(:'acc1', 'suspended');
SELECT t.as_root();
SELECT t.as_user(:'acc1');
SELECT t.eq((SELECT count(*)::int FROM public.acc_clients), 0, 'suspended accountant sees no clients');
SELECT t.denied($$INSERT INTO public.acc_clients (accountant_id, name) VALUES ('11111111-1111-1111-1111-111111111111','Y')$$, 'suspended accountant inserts');
SELECT t.as_root();

ROLLBACK;
