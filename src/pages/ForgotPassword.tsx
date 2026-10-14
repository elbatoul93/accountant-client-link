import { FormEvent, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const ForgotPassword = () => {
  const { t } = useApp();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Same message whether or not the account exists, so the form can't be used to probe emails.
      if (err && err.status !== 400 && err.status !== 422) {
        setError(err.message);
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t("auth_forgot_title")} subtitle={sent ? undefined : t("auth_forgot_subtitle")}>
      {sent ? (
        <p role="status" className="rounded-md border border-border/60 bg-muted/40 px-3 py-3 text-sm text-center">
          {t("auth_forgot_sent")}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("auth_email")}</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth_ph_email")} required autoComplete="email" />
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}>
            {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t("auth_forgot_send")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPassword;
