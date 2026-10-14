-- Signed-in-only RPCs must not be callable by anon (flagged by the Supabase advisor).
-- Idempotent: revokes PUBLIC/anon EXECUTE and keeps authenticated. Every function checks its caller itself as well.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'admin\_%' OR p.proname IN (
        'unlink_client', 'is_admin', 'is_active_accountant', 'my_subscription', 'subscription_read_only'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;

-- Internal helpers: no direct calls from API roles at all.
REVOKE ALL ON FUNCTION public.subscription_state_of(uuid) FROM PUBLIC, anon, authenticated;
