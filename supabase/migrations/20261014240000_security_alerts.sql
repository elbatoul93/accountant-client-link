-- Security alerts that admins can see (breach runbook gap "no alert on unusual activity"). Decided by default.
-- What the database can see: bulk deletes, invitation bursts, new accountant sign-ups, admin grants, and (when the
-- auth log table is readable) spikes of password-recovery and sign-up events. It cannot see plain reads: for
-- read monitoring use Supabase log alerts or a log drain (see breach-runbook.md).

CREATE TABLE public.security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  accountant_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(detail::text) <= 4000),
  dedupe_key text UNIQUE,
  acknowledged_at timestamptz,
  acknowledged_by uuid
);
CREATE INDEX security_alerts_open_idx ON public.security_alerts (at DESC) WHERE acknowledged_at IS NULL;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access to security_alerts" ON public.security_alerts FOR ALL TO authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON public.security_alerts FROM anon, authenticated;

-- Internal writer. Same dedupe_key = one alert (so a burst raises one row, not thousands).
CREATE OR REPLACE FUNCTION public.raise_security_alert(
  _kind text, _severity text, _accountant_id uuid, _detail jsonb, _dedupe_key text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_alerts (kind, severity, accountant_id, detail, dedupe_key)
  VALUES (_kind, _severity, _accountant_id, coalesce(_detail, '{}'::jsonb), _dedupe_key)
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.raise_security_alert(text, text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;

-- 1) Bulk delete by a signed-in user: 100 or more rows of one table in one statement.
CREATE OR REPLACE FUNCTION public.alert_bulk_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n bigint; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NULL; END IF;       -- support / service role work is not user activity
  SELECT count(*) INTO n FROM old_rows;
  IF n >= 100 THEN
    PERFORM public.raise_security_alert('bulk_delete', 'warning', uid,
      jsonb_build_object('table', TG_TABLE_NAME, 'rows', n),
      'bulk_delete:' || TG_TABLE_NAME || ':' || uid || ':' || to_char(now(), 'YYYYMMDDHH24'));
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.alert_bulk_delete() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acc_clients', 'acc_employees', 'acc_bills', 'acc_journal_lines', 'acc_invoices',
                           'acc_assets', 'acc_payslips', 'documents', 'messages']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS alert_bulk_delete_trg ON public.%I', t);
    EXECUTE format($f$CREATE TRIGGER alert_bulk_delete_trg AFTER DELETE ON public.%I
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.alert_bulk_delete()$f$, t);
  END LOOP;
END $$;

-- 2) Invitation burst: 30 invitations from one accountant within 10 minutes.
CREATE OR REPLACE FUNCTION public.alert_invitation_burst()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.invitations
   WHERE accountant_id = NEW.accountant_id AND created_at > now() - interval '10 minutes';
  IF n >= 30 THEN
    PERFORM public.raise_security_alert('invitation_burst', 'warning', NEW.accountant_id,
      jsonb_build_object('invitations_10min', n),
      'invitation_burst:' || NEW.accountant_id || ':' || to_char(now(), 'YYYYMMDDHH24'));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.alert_invitation_burst() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS alert_invitation_burst_trg ON public.invitations;
CREATE TRIGGER alert_invitation_burst_trg AFTER INSERT ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.alert_invitation_burst();

-- 3) A new accountant waiting for activation (so the admin notices without opening the list).
CREATE OR REPLACE FUNCTION public.alert_new_accountant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_type::text = 'accountant' AND NEW.account_status <> 'active' THEN
    PERFORM public.raise_security_alert('accountant_signup_pending', 'info', NEW.user_id,
      jsonb_build_object('name', NEW.name, 'company', NEW.company), 'accountant_signup:' || NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.alert_new_accountant() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS alert_new_accountant_trg ON public.profiles;
CREATE TRIGGER alert_new_accountant_trg AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.alert_new_accountant();

-- 4) Anyone added to admins (privilege escalation).
CREATE OR REPLACE FUNCTION public.alert_admin_granted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.raise_security_alert('admin_granted', 'critical', NEW.user_id,
    jsonb_build_object('user_id', NEW.user_id), 'admin_granted:' || NEW.user_id || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.alert_admin_granted() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS alert_admin_granted_trg ON public.admins;
CREATE TRIGGER alert_admin_granted_trg AFTER INSERT ON public.admins
  FOR EACH ROW EXECUTE FUNCTION public.alert_admin_granted();

-- 5) Scheduled scan of the auth event log: 20+ recovery requests or 30+ sign-ups in the last hour.
CREATE OR REPLACE FUNCTION public.scan_security_signals()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE recov int; signups int; raised int := 0; bucket text := to_char(now(), 'YYYYMMDDHH24');
BEGIN
  IF to_regclass('auth.audit_log_entries') IS NULL THEN RETURN 0; END IF;
  BEGIN
    SELECT count(*) FILTER (WHERE payload->>'action' = 'user_recovery_requested'),
           count(*) FILTER (WHERE payload->>'action' = 'user_signedup')
      INTO recov, signups
      FROM auth.audit_log_entries WHERE created_at > now() - interval '1 hour';
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;                       -- log table not readable on this plan: no alert, no failure
  END;
  IF recov >= 20 THEN
    PERFORM public.raise_security_alert('recovery_spike', 'warning', NULL, jsonb_build_object('last_hour', recov), 'recovery_spike:' || bucket);
    raised := raised + 1;
  END IF;
  IF signups >= 30 THEN
    PERFORM public.raise_security_alert('signup_spike', 'warning', NULL, jsonb_build_object('last_hour', signups), 'signup_spike:' || bucket);
    raised := raised + 1;
  END IF;
  RETURN raised;
END;
$$;
REVOKE ALL ON FUNCTION public.scan_security_signals() FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('scan-security-signals', '*/15 * * * *', 'SELECT public.scan_security_signals()');
  ELSE
    RAISE NOTICE 'pg_cron not enabled: schedule scan_security_signals() every 15 minutes once it is';
  END IF;
END $$;

-- Admin API.
CREATE OR REPLACE FUNCTION public.admin_list_security_alerts(_only_open boolean DEFAULT true, _limit int DEFAULT 100)
RETURNS SETOF public.security_alerts
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY SELECT * FROM public.security_alerts a
    WHERE NOT _only_open OR a.acknowledged_at IS NULL
    ORDER BY (a.severity = 'critical') DESC, a.at DESC
    LIMIT least(greatest(coalesce(_limit, 100), 1), 500);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_open_alert_count()
RETURNS int
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN (SELECT count(*) FROM public.security_alerts WHERE acknowledged_at IS NULL AND severity <> 'info')::int;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ack_security_alert(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.security_alerts SET acknowledged_at = now(), acknowledged_by = auth.uid()
   WHERE id = _id AND acknowledged_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alert not found or already acknowledged'; END IF;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id)
  VALUES (auth.uid(), 'security_alert.ack', 'security_alerts', _id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_security_alerts(boolean, int), public.admin_open_alert_count(),
  public.admin_ack_security_alert(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_security_alerts(boolean, int), public.admin_open_alert_count(),
  public.admin_ack_security_alert(uuid) TO authenticated;
