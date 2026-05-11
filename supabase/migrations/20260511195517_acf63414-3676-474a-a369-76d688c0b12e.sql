REVOKE ALL ON FUNCTION public.get_linked_client_names() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_linked_client_names() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_linked_client_names() TO authenticated;

DROP FUNCTION IF EXISTS public.get_linked_client_names(uuid);