import { isPasswordPwned } from "@/features/auth/pwnedPassword";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/features/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

/** Fixed, translated text for the errors Supabase returns when saving the new password. */
const resetErrorKey = (err: { status?: number; code?: string }) => {
  if (err.code === "same_password") return "auth_reset_same_password";
  if (err.code === "weak_password") return "auth_reset_weak";
  if (err.status === 429) return "auth_reset_rate_limited";
  if (err.code === "session_not_found" || err.code === "not_authenticated" || err.status === 401) return "auth_reset_session_expired";
  return "auth_reset_failed";
};

/** Landing page of the password-recovery email link; Supabase signs the user in from the URL. */
const ResetPassword = () => {
  const { t, user, loading } = useApp();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("auth_password_hint"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth_reset_mismatch"));
      return;
    }
    setBusy(true);
    try {
      if (await isPasswordPwned(password)) {
        setError(t("auth_password_pwned"));
        return;
      }
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(t(resetErrorKey(err)));
        return;
      }
      toast.success(t("auth_reset_done"));
      navigate(user?.role === "accountant" ? "/dashboard/accountant" : "/dashboard/client", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  // No session after the URL was processed: the link is invalid or expired.
  if (!user) {
    return (
      <AuthLayout title={t("auth_reset_title")}>
        <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t("auth_reset_invalid_link")}
        </p>
        <Link to="/forgot-password" className="block text-center text-primary font-semibold hover:underline">
          {t("auth_forgot_send")}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth_reset_title")} subtitle={t("auth_reset_subtitle")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">{t("auth_reset_new_password")}</Label>
          <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            required minLength={8} autoComplete="new-password" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">{t("auth_reset_confirm")}</Label>
          <Input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            required minLength={8} autoComplete="new-password" />
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          {t("auth_reset_save")}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default ResetPassword;
