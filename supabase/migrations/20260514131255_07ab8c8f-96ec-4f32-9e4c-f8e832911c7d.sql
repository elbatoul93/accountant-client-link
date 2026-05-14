DROP FUNCTION IF EXISTS public.get_linked_client_names();

CREATE OR REPLACE FUNCTION public.get_linked_client_names()
 RETURNS TABLE(
   id uuid, full_name text, direction text, commune text, bp text,
   company text, email text, phone text, address text,
   legal_form text, activity text, tax_regime text,
   tax_id text, nis text, rc text,
   cnas_no text, casnos_no text, has_cacobatph boolean
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH current_profile AS (
    SELECT p.user_id, p.linked_accountant_id, p.user_type
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  )
  SELECT p.user_id AS id, p.name AS full_name, p.direction, p.commune, p.bp,
         p.company, p.email, p.phone, p.address,
         p.legal_form, p.activity, p.tax_regime,
         p.tax_id, p.nis, p.rc,
         p.cnas_no, p.casnos_no, p.has_cacobatph
  FROM public.profiles p
  CROSS JOIN current_profile cp
  WHERE (
    cp.user_type = 'accountant'::public.app_role
    AND p.linked_accountant_id = auth.uid()
  ) OR (
    cp.user_type = 'client'::public.app_role
    AND p.user_id = cp.linked_accountant_id
  );
$function$;