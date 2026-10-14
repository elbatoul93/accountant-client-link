-- Retention (SEC-16): a signed document is a record. Users cannot delete it; only the service role
-- (support, or the cascade when an account is erased under the retention policy) can.
CREATE OR REPLACE FUNCTION public.protect_signed_document_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND OLD.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'A signed document cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS acc_shared_protect_delete ON public.acc_shared_documents;
CREATE TRIGGER acc_shared_protect_delete
  BEFORE DELETE ON public.acc_shared_documents
  FOR EACH ROW EXECUTE FUNCTION public.protect_signed_document_delete();
