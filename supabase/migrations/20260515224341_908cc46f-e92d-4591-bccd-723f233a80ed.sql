CREATE OR REPLACE FUNCTION public.get_my_linked_accountant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT linked_accountant_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

DROP POLICY IF EXISTS "Client can view their accountant profile" ON public.profiles;
CREATE POLICY "Client can view their accountant profile"
ON public.profiles
FOR SELECT
USING (user_id = public.get_my_linked_accountant_id());

NOTIFY pgrst, 'reload schema';