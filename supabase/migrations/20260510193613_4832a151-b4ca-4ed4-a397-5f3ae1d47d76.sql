
-- 1. Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_type public.app_role NOT NULL DEFAULT 'accountant',
  ADD COLUMN IF NOT EXISTS linked_accountant_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_linked_accountant ON public.profiles(linked_accountant_id);

-- 2. Invitations table
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  accountant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  used boolean NOT NULL DEFAULT false,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_accountant ON public.invitations(accountant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can look up an invite by token to validate it on the signup page.
CREATE POLICY "Anyone can view invitations by token"
  ON public.invitations FOR SELECT
  USING (true);

CREATE POLICY "Accountants can create invitations"
  ON public.invitations FOR INSERT
  WITH CHECK (auth.uid() = accountant_id AND public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Accountants can update their own invitations"
  ON public.invitations FOR UPDATE
  USING (auth.uid() = accountant_id);

CREATE POLICY "Accountants can delete their own invitations"
  ON public.invitations FOR DELETE
  USING (auth.uid() = accountant_id);

-- 3. Replace handle_new_user to honor invite tokens
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite_token text;
  _invite RECORD;
  _role public.app_role;
  _linked uuid;
BEGIN
  _invite_token := NEW.raw_user_meta_data->>'invite_token';

  IF _invite_token IS NOT NULL AND length(_invite_token) > 0 THEN
    SELECT * INTO _invite
      FROM public.invitations
      WHERE token = _invite_token
        AND used = false
        AND expires_at > now()
      LIMIT 1;

    IF FOUND THEN
      _role := 'client';
      _linked := _invite.accountant_id;

      UPDATE public.invitations
        SET used = true, used_by = NEW.id, used_at = now()
        WHERE id = _invite.id;
    ELSE
      -- Invalid/expired token: refuse to create the account
      RAISE EXCEPTION 'Invalid or expired invitation token';
    END IF;
  ELSE
    -- No invite => only accountants can self-register
    _role := 'accountant';
    _linked := NULL;
  END IF;

  INSERT INTO public.profiles (user_id, name, email, company, user_type, linked_accountant_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'company',
    _role,
    _linked
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;

-- Make sure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Allow linked accountant <-> client visibility on profiles
DROP POLICY IF EXISTS "Linked accountant can view client profile" ON public.profiles;
CREATE POLICY "Linked accountant can view client profile"
  ON public.profiles FOR SELECT
  USING (linked_accountant_id = auth.uid());

DROP POLICY IF EXISTS "Client can view their accountant profile" ON public.profiles;
CREATE POLICY "Client can view their accountant profile"
  ON public.profiles FOR SELECT
  USING (
    user_id IN (
      SELECT linked_accountant_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );
