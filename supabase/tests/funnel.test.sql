-- Admin activation funnel (counts and steps) and security alerts, on plain PostgreSQL.
-- Each check raises on failure. Own helpers in schema f so the file runs on its own.
CREATE SCHEMA f;
GRANT USAGE ON SCHEMA f TO PUBLIC;
CREATE FUNCTION f.as_user(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION f.as_root() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
CREATE FUNCTION f.eq(_actual anyelement, _expected anyelement, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN RAISE EXCEPTION '% : expected %, got %', _what, _expected, _actual; END IF;
END $$;
CREATE FUNCTION f.denied(_sql text, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE _sql; EXCEPTION WHEN OTHERS THEN RETURN; END;
  RAISE EXCEPTION 'expected failure but succeeded: %', _what;
END $$;

\o /dev/null
\set a1  'aaaaaaaa-0000-0000-0000-000000000001'
\set a2  'aaaaaaaa-0000-0000-0000-000000000002'
\set a3  'aaaaaaaa-0000-0000-0000-000000000003'
\set adm 'aaaaaaaa-0000-0000-0000-0000000000ff'
\set cl  'aaaaaaaa-0000-0000-0000-0000000000c1'

BEGIN;
-- Self-signups are accountants (pending). The admin user is one too, so it counts in the cohort.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  (:'a1', 'a1@example.com', '{"name":"A One"}'),
  (:'a2', 'a2@example.com', '{"name":"A Two"}'),
  (:'a3', 'a3@example.com', '{"name":"A Three"}'),
  (:'adm', 'admin@example.com', '{"name":"Admin"}'),
  (:'cl', 'cl@example.com', '{"name":"Client"}');
UPDATE public.profiles SET user_type = 'client' WHERE user_id = :'cl';
INSERT INTO public.admins (user_id) VALUES (:'adm');

-- Security alerts raised by the signups and the admin grant.
SELECT f.eq((SELECT count(*)::int FROM public.security_alerts WHERE kind = 'admin_granted' AND severity = 'critical'), 1, 'admin grant raises a critical alert');
SELECT f.eq((SELECT count(*)::int FROM public.security_alerts WHERE kind = 'accountant_signup_pending'), 4, 'pending accountant signups raise info alerts');

-- a1: activated, client, G50 sent, paid.  a2: activated, client only.  a3: pending.
SELECT f.as_user(:'adm');
SELECT public.admin_set_accountant_status(:'a1', 'active');
SELECT public.admin_set_accountant_status(:'a2', 'active');
SELECT f.as_root();
INSERT INTO public.acc_clients (accountant_id, name) VALUES (:'a1', 'C1'), (:'a1', 'C1b'), (:'a2', 'C2');
INSERT INTO public.g50_declarations (accountant_id, client_id, month, year, form_data, sent, sent_at)
  VALUES (:'a1', :'cl', 1, 2026, '{}', true, now());
INSERT INTO public.g50_declarations (accountant_id, client_id, month, year, form_data, sent)
  VALUES (:'a2', :'cl', 1, 2026, '{}', false);
SELECT f.as_user(:'adm');
SELECT public.admin_record_payment(:'a1', 5000, 1);
SELECT f.as_root();

-- Non-admins cannot call the funnel or the alert functions.
SELECT f.as_user(:'a1');
SELECT f.denied($$SELECT * FROM public.admin_activation_funnel()$$, 'non-admin funnel');
SELECT f.denied($$SELECT * FROM public.admin_activation_accountants()$$, 'non-admin accountant list');
SELECT f.denied($$SELECT * FROM public.admin_list_security_alerts()$$, 'non-admin alert list');
SELECT f.denied($$SELECT public.admin_open_alert_count()$$, 'non-admin alert count');
SELECT f.as_root();

-- Funnel counts (all time): 4 accountant profiles (a1, a2, a3, admin), 2 active, 2 with a client, 1 G50 sent, 1 paid.
SELECT f.as_user(:'adm');
SELECT f.eq((SELECT signed_up FROM public.admin_activation_funnel(NULL)), 4::bigint, 'signed_up');
SELECT f.eq((SELECT activated FROM public.admin_activation_funnel(NULL)), 2::bigint, 'activated');
SELECT f.eq((SELECT first_client FROM public.admin_activation_funnel(NULL)), 2::bigint, 'first_client');
SELECT f.eq((SELECT first_g50 FROM public.admin_activation_funnel(NULL)), 1::bigint, 'first_g50 counts sent only');
SELECT f.eq((SELECT paid FROM public.admin_activation_funnel(NULL)), 1::bigint, 'paid');
-- Cohort by registration date: nobody registered in the future.
SELECT f.eq((SELECT signed_up FROM public.admin_activation_funnel(now() + interval '1 day')), 0::bigint, 'future cohort is empty');

-- Voiding the only receipt removes it from the paid step.
SELECT public.admin_void_receipt((SELECT id FROM public.admin_list_receipts(:'a1') LIMIT 1), 'test');
SELECT f.eq((SELECT paid FROM public.admin_activation_funnel(NULL)), 0::bigint, 'voided receipt is not paid');

-- Per-accountant steps.
SELECT f.eq((SELECT count(*)::int FROM public.admin_activation_accountants(NULL)), 4, 'accountant rows');
SELECT f.eq((SELECT clients FROM public.admin_activation_accountants(NULL) WHERE user_id = :'a1'), 2::bigint, 'a1 clients');
SELECT f.eq((SELECT first_client_at IS NOT NULL FROM public.admin_activation_accountants(NULL) WHERE user_id = :'a1'), true, 'a1 first client date');
SELECT f.eq((SELECT first_g50_sent_at IS NOT NULL FROM public.admin_activation_accountants(NULL) WHERE user_id = :'a1'), true, 'a1 G50 sent date');
SELECT f.eq((SELECT first_g50_sent_at IS NULL FROM public.admin_activation_accountants(NULL) WHERE user_id = :'a2'), true, 'a2 unsent G50 does not count');
SELECT f.eq((SELECT activated_at IS NOT NULL FROM public.admin_activation_accountants(NULL) WHERE user_id = :'a1'), true, 'a1 activation time from audit log');
SELECT f.eq((SELECT activated_at IS NULL AND first_client_at IS NULL AND first_g50_sent_at IS NULL AND first_payment_at IS NULL
             FROM public.admin_activation_accountants(NULL) WHERE user_id = :'a3'), true, 'a3 has no steps');

-- Admin alert API.
SELECT f.eq((SELECT count(*)::int FROM public.admin_list_security_alerts() WHERE kind = 'admin_granted'), 1, 'admin sees the grant alert');
SELECT f.eq((SELECT kind FROM public.admin_list_security_alerts() LIMIT 1), 'admin_granted', 'critical first');
SELECT f.eq(public.admin_open_alert_count(), 1, 'open count excludes info alerts');
SELECT public.admin_ack_security_alert((SELECT id FROM public.admin_list_security_alerts() WHERE kind = 'admin_granted'));
SELECT f.eq(public.admin_open_alert_count(), 0, 'acknowledged alert no longer counts');
SELECT f.denied($$SELECT public.admin_ack_security_alert((SELECT id FROM public.security_alerts LIMIT 1))$$, 'ack twice or via direct table read');
SELECT f.as_root();

ROLLBACK;
