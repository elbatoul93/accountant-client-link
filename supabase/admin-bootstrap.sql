-- One-time statement, run by the apply script AFTER migration 20261014234000.
-- Replace the placeholder with the admin's login email. Do not commit a real address.
-- Run with the service role (SQL editor or `supabase db query`), never from the app.
INSERT INTO public.admins (user_id)
SELECT id FROM auth.users WHERE lower(email) = lower('<ADMIN_EMAIL>')
ON CONFLICT DO NOTHING;
