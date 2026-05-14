ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legal_form text,
  ADD COLUMN IF NOT EXISTS activity text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS nis text,
  ADD COLUMN IF NOT EXISTS rc text,
  ADD COLUMN IF NOT EXISTS cnas_no text,
  ADD COLUMN IF NOT EXISTS casnos_no text,
  ADD COLUMN IF NOT EXISTS has_cacobatph boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_regime text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text;