CREATE OR REPLACE FUNCTION public.get_linked_client_names()
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.user_id AS id, p.name AS full_name
  FROM public.profiles p
  WHERE p.linked_accountant_id = auth.uid();
$$;