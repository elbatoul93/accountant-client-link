-- Activation funnel for the admin page (admin-only, read-only, built from records the database already holds;
-- no new tracking of users). Decided by default.
--   signed_up    accountants who registered in the period
--   activated    of those, currently active (existing accounts were active from the start)
--   first_client of those, with at least one client record
--   first_g50    of those, with at least one G50 marked sent
--   paid         of those, with at least one receipt that is not voided
-- "In the period" is by registration date, so each step is a share of the same group of people.

CREATE OR REPLACE FUNCTION public.admin_activation_funnel(_since timestamptz DEFAULT now() - interval '90 days')
RETURNS TABLE (signed_up bigint, activated bigint, first_client bigint, first_g50 bigint, paid bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY
  WITH cohort AS (
    SELECT p.user_id, p.account_status FROM public.profiles p
    WHERE p.user_type::text = 'accountant' AND p.created_at >= coalesce(_since, '-infinity')
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE c.account_status = 'active'),
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.acc_clients k WHERE k.accountant_id = c.user_id)),
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.g50_declarations g WHERE g.accountant_id = c.user_id AND g.sent)),
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.payment_receipts r WHERE r.accountant_id = c.user_id AND r.voided_at IS NULL))
  FROM cohort c;
END;
$$;

-- One row per accountant, to see who is stuck at which step.
CREATE OR REPLACE FUNCTION public.admin_activation_accountants(_since timestamptz DEFAULT now() - interval '90 days')
RETURNS TABLE (
  user_id uuid, name text, email text, company text, account_status text,
  signed_up_at timestamptz, activated_at timestamptz, first_client_at timestamptz,
  first_g50_sent_at timestamptz, first_payment_at timestamptz, clients bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY
  SELECT p.user_id, p.name, p.email, p.company, p.account_status,
    p.created_at,
    -- activation time = the admin action that made the account active, else null (active from the start)
    (SELECT min(a.at) FROM public.audit_log a
      WHERE a.accountant_id = p.user_id AND a.action = 'accountant.status' AND a.detail->>'status' = 'active'),
    (SELECT min(k.created_at) FROM public.acc_clients k WHERE k.accountant_id = p.user_id),
    (SELECT min(g.sent_at) FROM public.g50_declarations g WHERE g.accountant_id = p.user_id AND g.sent),
    (SELECT min(r.created_at) FROM public.payment_receipts r WHERE r.accountant_id = p.user_id AND r.voided_at IS NULL),
    (SELECT count(*) FROM public.acc_clients k WHERE k.accountant_id = p.user_id)
  FROM public.profiles p
  WHERE p.user_type::text = 'accountant' AND p.created_at >= coalesce(_since, '-infinity')
  ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_activation_funnel(timestamptz), public.admin_activation_accountants(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activation_funnel(timestamptz), public.admin_activation_accountants(timestamptz) TO authenticated;
