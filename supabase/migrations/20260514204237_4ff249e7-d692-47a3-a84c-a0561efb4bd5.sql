CREATE POLICY "Accountant update own g50"
ON public.g50_declarations
FOR UPDATE
USING (auth.uid() = accountant_id)
WITH CHECK (auth.uid() = accountant_id);