-- Retention (SEC-16), accountant side. 233000 already stops users deleting signed acc_shared_documents. This closes the
-- other ways an accountant could erase a record the 10-year rule keeps: a delivered G50 PDF row, a G50 whose PDF was
-- delivered, and un-sending a G50 (sent true -> false) so it can be deleted. Signed documents are already frozen, signature included,
-- by protect_shared_document_fields (230000).
-- Only signed-in users are restricted (auth.uid() not null); support and the cascade from an erased account run without
-- a user and keep working.
CREATE OR REPLACE FUNCTION public.protect_delivered_g50_rows()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'shared_documents' THEN
    IF TG_OP = 'DELETE' AND OLD.g50_declaration_id IS NOT NULL THEN
      RAISE EXCEPTION 'A delivered G50 cannot be deleted';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.g50_declaration_id IS NOT NULL
       AND (NEW.g50_declaration_id IS DISTINCT FROM OLD.g50_declaration_id OR NEW.file_path IS DISTINCT FROM OLD.file_path) THEN
      RAISE EXCEPTION 'A delivered G50 cannot be changed';
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- g50_declarations
  IF TG_OP = 'DELETE' THEN
    IF OLD.sent OR EXISTS (SELECT 1 FROM public.shared_documents d WHERE d.g50_declaration_id = OLD.id) THEN
      RAISE EXCEPTION 'A sent G50 cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.sent AND NOT NEW.sent THEN
    RAISE EXCEPTION 'A sent G50 cannot be marked as not sent';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shared_documents_retention ON public.shared_documents;
CREATE TRIGGER shared_documents_retention BEFORE UPDATE OR DELETE ON public.shared_documents
  FOR EACH ROW EXECUTE FUNCTION public.protect_delivered_g50_rows();
DROP TRIGGER IF EXISTS g50_declarations_retention ON public.g50_declarations;
CREATE TRIGGER g50_declarations_retention BEFORE UPDATE OR DELETE ON public.g50_declarations
  FOR EACH ROW EXECUTE FUNCTION public.protect_delivered_g50_rows();
