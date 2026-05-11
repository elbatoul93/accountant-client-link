-- Revoke execute on the new SECURITY DEFINER function from anon/public
-- so only authenticated users can call it via RPC
REVOKE EXECUTE ON FUNCTION public.is_linked_accountant(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_linked_accountant(uuid) FROM public;

GRANT EXECUTE ON FUNCTION public.is_linked_accountant(uuid) TO authenticated;