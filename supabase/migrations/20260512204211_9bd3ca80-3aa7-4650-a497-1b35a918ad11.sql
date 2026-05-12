
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS commune text,
  ADD COLUMN IF NOT EXISTS bp text;

DROP POLICY IF EXISTS "Linked accountant can update client profile" ON public.profiles;
CREATE POLICY "Linked accountant can update client profile"
ON public.profiles
FOR UPDATE
USING (linked_accountant_id = auth.uid())
WITH CHECK (linked_accountant_id = auth.uid());

DROP FUNCTION IF EXISTS public.get_linked_client_names();

CREATE OR REPLACE FUNCTION public.get_linked_client_names()
 RETURNS TABLE(id uuid, full_name text, direction text, commune text, bp text)
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
  SELECT p.user_id AS id, p.name AS full_name, p.direction, p.commune, p.bp
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
