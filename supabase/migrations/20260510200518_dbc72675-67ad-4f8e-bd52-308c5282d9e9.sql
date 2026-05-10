GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;

DROP POLICY IF EXISTS "Accountants can view their own invitations" ON public.invitations;
CREATE POLICY "Accountants can view their own invitations"
  ON public.invitations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = accountant_id);