CREATE OR REPLACE FUNCTION public.get_linked_client_names()
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH current_profile AS (
    SELECT p.user_id, p.linked_accountant_id, p.user_type
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  )
  SELECT p.user_id AS id, p.name AS full_name
  FROM public.profiles p
  CROSS JOIN current_profile cp
  WHERE (
    cp.user_type = 'accountant'::public.app_role
    AND p.linked_accountant_id = auth.uid()
  ) OR (
    cp.user_type = 'client'::public.app_role
    AND p.user_id = cp.linked_accountant_id
  );
$$;

REVOKE ALL ON FUNCTION public.get_linked_client_names() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_linked_client_names() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_linked_client_names() TO authenticated;