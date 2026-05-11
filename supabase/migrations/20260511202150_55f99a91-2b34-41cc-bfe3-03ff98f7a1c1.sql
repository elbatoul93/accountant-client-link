-- Step 1: Safe helper function that bypasses RLS when checking accountant linkage
CREATE OR REPLACE FUNCTION public.is_linked_accountant(client_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = client_user_id
    AND p.linked_accountant_id = auth.uid()
  );
$$;

-- Step 2: Drop the broken policy (exact name must match)
DROP POLICY IF EXISTS "Linked accountant can view client documents" ON public.documents;

-- Step 3: Recreate it using the safe helper instead of querying profiles directly
CREATE POLICY "Linked accountant can view client documents"
ON public.documents
FOR SELECT
USING (
  public.is_linked_accountant(user_id)
);