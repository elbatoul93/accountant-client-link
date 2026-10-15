-- Subscriptions, cash receipts and the admin billing API, on plain PostgreSQL.
-- Each check raises on failure. Own helpers in schema b so the file runs on its own.
CREATE SCHEMA b;
GRANT USAGE ON SCHEMA b TO PUBLIC;
CREATE FUNCTION b.as_user(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION b.as_root() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
CREATE FUNCTION b.eq(_actual anyelement, _expected anyelement, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN RAISE EXCEPTION '% : expected %, got %', _what, _expected, _actual; END IF;
END $$;
CREATE FUNCTION b.denied(_sql text, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE _sql; EXCEPTION WHEN OTHERS THEN RETURN; END;
  RAISE EXCEPTION 'expected failure but succeeded: %', _what;
END $$;

\o /dev/null
\set a1  'bbbbbbbb-0000-0000-0000-000000000001'
\set a2  'bbbbbbbb-0000-0000-0000-000000000002'
\set adm 'bbbbbbbb-0000-0000-0000-0000000000ff'

BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  (:'a1', 'a1@example.com', '{"name":"A One"}'),
  (:'a2', 'a2@example.com', '{"name":"A Two"}'),
  (:'adm', 'admin@example.com', '{"name":"Admin"}');
INSERT INTO public.admins (user_id) VALUES (:'adm');

-- a1 is an activated accountant, so only the subscription can block its writes.
SELECT b.as_user(:'adm');
SELECT public.admin_set_accountant_status(:'a1', 'active');
SELECT b.as_root();

-- No subscription row: nothing is restricted.
SELECT b.eq(public.subscription_state_of(:'a1'), 'unrestricted', 'no row is unrestricted');

-- Non-admins cannot call any billing function.
SELECT b.as_user(:'a1');
SELECT b.denied($$SELECT public.admin_set_subscription(auth.uid(), 'standard', NULL, now() + interval '1 year', 7)$$, 'self-grant subscription');
SELECT b.denied($$SELECT public.admin_record_payment(auth.uid(), 1000, 1)$$, 'self-record payment');
SELECT b.denied($$SELECT * FROM public.admin_list_receipts()$$, 'list receipts');
SELECT b.denied($$SELECT * FROM public.admin_list_subscriptions()$$, 'list subscriptions');
SELECT b.denied($$SELECT public.admin_get_billing_settings()$$, 'read billing settings');
SELECT b.denied($$SELECT public.admin_set_billing_settings('{"x":1}')$$, 'set billing settings');
SELECT b.denied($$SELECT public.admin_void_receipt(gen_random_uuid(), 'x')$$, 'void receipt');
-- Direct table writes are refused.
SELECT b.denied($$INSERT INTO public.subscriptions (accountant_id, paid_until) VALUES (auth.uid(), now() + interval '9 years')$$, 'direct subscription insert');
SELECT b.denied($$INSERT INTO public.payment_receipts (receipt_no, year, seq, payer, amount, plan, period_months, period_start, period_end) VALUES ('REC-X', 2026, 99, '{}', 1, 'p', 1, now(), now())$$, 'direct receipt insert');
SELECT b.denied($$SELECT * FROM public.billing_settings$$, 'billing settings table');
SELECT b.denied($$SELECT * FROM public.receipt_counters$$, 'receipt counters table');
SELECT b.as_root();

-- Admin: settings, payments, numbering.
SELECT b.as_user(:'adm');
SELECT public.admin_set_billing_settings('{"name":"Managementik SARL"}');
SELECT b.eq(public.admin_get_billing_settings() ->> 'name', 'Managementik SARL', 'billing settings round trip');
SELECT b.denied($$SELECT public.admin_record_payment('bbbbbbbb-0000-0000-0000-0000000000aa', 1000, 1)$$, 'payment for unknown accountant');
SELECT b.denied($$SELECT public.admin_record_payment('bbbbbbbb-0000-0000-0000-000000000001', 0, 1)$$, 'zero amount');
SELECT b.denied($$SELECT public.admin_record_payment('bbbbbbbb-0000-0000-0000-000000000001', 1000, 0)$$, 'zero months');
SELECT b.denied($$SELECT public.admin_record_payment('bbbbbbbb-0000-0000-0000-000000000001', 1000, 1, 'bitcoin')$$, 'unknown method');
SELECT public.admin_record_payment(:'a1', 5000, 3, 'cash', NULL, DATE '2026-03-01');
SELECT public.admin_record_payment(:'a2', 2000, 1, 'cash', NULL, DATE '2026-04-01');
SELECT public.admin_record_payment(:'a1', 5000, 1, 'transfer', 'pro', DATE '2027-01-05');
SELECT b.eq((SELECT array_agg(receipt_no ORDER BY paid_at) FROM public.admin_list_receipts()),
            ARRAY['REC-2026-000001','REC-2026-000002','REC-2027-000001'], 'gapless numbers per year');
SELECT b.eq((SELECT issuer ->> 'name' FROM public.admin_list_receipts(:'a2') LIMIT 1), 'Managementik SARL', 'receipt snapshots the issuer');
SELECT b.eq((SELECT payer ->> 'name' FROM public.admin_list_receipts(:'a2') LIMIT 1), 'A Two', 'receipt snapshots the payer');
SELECT b.eq((SELECT plan FROM public.admin_list_receipts(:'a1') WHERE seq = 1 AND year = 2027), 'pro', 'plan override recorded');
-- Failed payments burned no number.
SELECT b.as_root();
SELECT b.eq((SELECT last_no FROM public.receipt_counters WHERE year = 2026), 2, 'counter only advanced by successful payments');
SELECT b.as_user(:'adm');

-- Payments extend paid_until, stacking on a still-valid period.
SELECT b.eq((SELECT paid_until > now() + interval '3 months 20 days' AND paid_until < now() + interval '4 months 10 days'
             FROM public.admin_list_subscriptions() WHERE user_id = :'a1'), true, 'second payment stacks on the paid period (3 + 1 months)');
SELECT b.eq((SELECT plan FROM public.admin_list_subscriptions() WHERE user_id = :'a1'), 'pro', 'plan updated by payment');

-- Receipts are immutable; only voiding is allowed; never deleted.
SELECT b.as_root();
SELECT b.denied($$UPDATE public.payment_receipts SET amount = 1 WHERE receipt_no = 'REC-2026-000001'$$, 'edit amount');
SELECT b.denied($$UPDATE public.payment_receipts SET receipt_no = 'REC-2026-000009' WHERE receipt_no = 'REC-2026-000001'$$, 'edit number');
SELECT b.denied($$DELETE FROM public.payment_receipts WHERE receipt_no = 'REC-2026-000001'$$, 'delete receipt');
SELECT b.as_user(:'adm');
SELECT b.denied($$SELECT public.admin_void_receipt((SELECT id FROM public.admin_list_receipts() WHERE receipt_no = 'REC-2026-000001'), '')$$, 'void needs a reason');
SELECT public.admin_void_receipt((SELECT id FROM public.admin_list_receipts() WHERE receipt_no = 'REC-2026-000001'), 'duplicate');
SELECT b.denied($$SELECT public.admin_void_receipt((SELECT id FROM public.admin_list_receipts() WHERE receipt_no = 'REC-2026-000001'), 'again')$$, 'void twice');
SELECT b.as_root();
SELECT b.eq((SELECT void_reason FROM public.payment_receipts WHERE receipt_no = 'REC-2026-000001'), 'duplicate', 'void reason stored');
SELECT b.denied($$UPDATE public.payment_receipts SET voided_at = NULL WHERE receipt_no = 'REC-2026-000001'$$, 'un-void');
SELECT b.eq((SELECT count(*)::int FROM public.audit_log WHERE action IN ('payment.recorded','receipt.voided')), 4, 'payments and void are audited');

-- Erasing the accountant keeps the receipt.
DELETE FROM auth.users WHERE id = :'a2';
SELECT b.eq((SELECT count(*)::int FROM public.payment_receipts WHERE receipt_no = 'REC-2026-000002' AND accountant_id IS NULL), 1, 'receipt outlives the account');

-- Subscription state machine.
SELECT b.as_user(:'adm');
SELECT public.admin_set_subscription(:'a1', 'standard', now() + interval '10 days', NULL, 7);
SELECT b.eq((SELECT state FROM public.admin_list_subscriptions() WHERE user_id = :'a1'), 'trial', 'trial');
SELECT public.admin_set_subscription(:'a1', 'standard', now() - interval '3 days', NULL, 7);
SELECT b.eq((SELECT state FROM public.admin_list_subscriptions() WHERE user_id = :'a1'), 'grace', 'grace after trial');
SELECT public.admin_set_subscription(:'a1', 'standard', now() - interval '30 days', NULL, 7);
SELECT b.eq((SELECT state FROM public.admin_list_subscriptions() WHERE user_id = :'a1'), 'read_only', 'read-only after grace');
SELECT public.admin_set_subscription(:'a1', 'standard', NULL, now() + interval '5 days', 7);
SELECT b.eq((SELECT state FROM public.admin_list_subscriptions() WHERE user_id = :'a1'), 'active', 'active when paid');
SELECT public.admin_set_subscription(:'a1', 'standard', NULL, NULL, 7);
SELECT b.eq((SELECT state FROM public.admin_list_subscriptions() WHERE user_id = :'a1'), 'unrestricted', 'cleared dates unrestrict');
SELECT b.denied($$SELECT public.admin_set_subscription('bbbbbbbb-0000-0000-0000-0000000000aa', 'standard', NULL, now(), 7)$$, 'unknown accountant');
SELECT b.denied($$SELECT public.admin_set_subscription('bbbbbbbb-0000-0000-0000-000000000001', 'standard', NULL, now(), 200)$$, 'grace over 90 days');

-- Read-only mode blocks the accountant's own writes, but not reads; active mode allows them.
SELECT public.admin_set_subscription(:'a1', 'standard', now() - interval '30 days', NULL, 7);
SELECT b.as_user(:'a1');
SELECT b.eq((SELECT state FROM public.my_subscription()), 'read_only', 'my_subscription reports read_only');
SELECT b.denied($$INSERT INTO public.acc_clients (accountant_id, name) VALUES (auth.uid(), 'Nope')$$, 'insert while read-only');
SELECT b.eq((SELECT count(*)::int FROM public.acc_clients), 0, 'reads still work while read-only');
SELECT b.as_user(:'adm');
SELECT public.admin_record_payment(:'a1', 5000, 1);
SELECT b.as_user(:'a1');
SELECT b.eq((SELECT state FROM public.my_subscription()), 'active', 'payment reactivates');
INSERT INTO public.acc_clients (accountant_id, name) VALUES (:'a1', 'Allowed');
SELECT b.eq((SELECT count(*)::int FROM public.payment_receipts), 3, 'accountant sees own receipts, voided included');
SELECT b.eq((SELECT count(*)::int FROM public.payment_receipts WHERE accountant_id IS DISTINCT FROM auth.uid()), 0, 'accountant sees nobody else''s receipts');
SELECT b.denied($$SELECT public.subscription_state_of(auth.uid())$$, 'internal state function not callable');
SELECT b.as_root();

ROLLBACK;
