import { useState, FormEvent, useEffect } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { ArrowLeft, Briefcase, Building2, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AuthFormProps {
  mode: "login" | "signup";
  /** When set, this is a client invite signup using the given token. */
  inviteToken?: string;
}

export const AuthForm = ({ mode, inviteToken }: AuthFormProps) => {
  const { t, user, loading, lang } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const pendingEmail = (location.state as { pendingConfirmationEmail?: string } | null)?.pendingConfirmationEmail;
  const params = useParams();
  const token = inviteToken ?? params.token;
  const isInvite = mode === "signup" && !!token;

  const [name, setName] = useState("");
  const [email, setEmail] = useState(pendingEmail ?? "");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // The invited address is fixed by the accountant; the signup trigger rejects any other.
  const [emailLocked, setEmailLocked] = useState(false);
  const [inviteValid, setInviteValid] = useState<null | boolean>(isInvite ? null : true);
  const [accountantName, setAccountantName] = useState<string>("");
  const [prefillName, setPrefillName] = useState<string>("");
  const [prefillCompany, setPrefillCompany] = useState<string>("");
  // Email of an account that exists but hasn't confirmed its address yet
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(pendingEmail ?? null);
  const [resending, setResending] = useState(false);

  // Already signed in (e.g. arriving from the email confirmation link): skip the form.
  useEffect(() => {
    if (mode !== "login" || loading || !user) return;
    navigate(user.role === "accountant" ? "/dashboard/accountant" : "/dashboard/client", { replace: true });
  }, [mode, loading, user, navigate]);

  const handleResend = async () => {
    if (!unconfirmedEmail) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: unconfirmedEmail,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t("auth_confirmation_resent"));
    } finally {
      setResending(false);
    }
  };

  // Validate invite token on mount
  useEffect(() => {
    if (!isInvite || !token) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_invitation_by_token", { _token: token });
      const inv = data?.[0];
      if (error || !inv?.is_valid) {
        setInviteValid(false);
        return;
      }
      setInviteValid(true);
      setPrefillName(inv.prefill_name || "");
      setPrefillCompany(inv.prefill_company || "");
      if (inv.email) {
        setEmail(inv.email);
        setEmailLocked(true);
      }
      if (inv.accountant_name) setAccountantName(inv.accountant_name);
    })();
  }, [isInvite, token]);

  const [accepted, setAccepted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!email || !password) {
      setFormError(t("auth_fill_all_fields"));
      return;
    }
    const needsName = mode === "signup" && !(isInvite && prefillName);
    if (needsName && !name.trim()) {
      setFormError(t("auth_name_required"));
      return;
    }
    if (mode === "signup" && !accepted) {
      setFormError(t("auth_consent_required"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const role = isInvite ? "client" : "accountant";
        const redirectUrl = `${window.location.origin}/login`;
        const resolvedName = isInvite ? (prefillName || name.trim()) : name.trim();
        const resolvedCompany = (isInvite ? prefillCompany : company).trim();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              name: resolvedName,
              ...(resolvedCompany ? { company: resolvedCompany } : {}),
              role,
              user_type: role,
              ...(isInvite ? { invite_token: token } : {}),
            },
          },
        });
        if (error) {
          if (error.message.toLowerCase().includes("already")) {
            setFormError(t("auth_account_exists"));
          } else if (
            error.message.toLowerCase().includes("invit") ||
            error.message.toLowerCase().includes("expired") ||
            // Supabase hides the trigger's RAISE EXCEPTION text behind this generic message
            (isInvite && error.message.toLowerCase().includes("database error"))
          ) {
            setFormError(t("auth_invite_link_expired"));
          } else {
            setFormError(error.message);
          }
          return;
        }
        // Supabase hides "already registered" behind a user with no identities
        if (data.user && (data.user.identities?.length ?? 1) === 0) {
          setFormError(t("auth_account_exists"));
          return;
        }
        if (!data.session) {
          toast.success(t("auth_check_email_confirm"));
          navigate("/login", { state: { pendingConfirmationEmail: email } });
          return;
        }
        toast.success(t("toast_signup_success"));
        navigate(role === "accountant" ? "/dashboard/accountant" : "/dashboard/client");
        return;
      }

      // LOGIN
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = error.message.toLowerCase();
        if (error.code === "email_not_confirmed" || msg.includes("not confirmed")) {
          setUnconfirmedEmail(email);
          setFormError(t("auth_email_not_confirmed"));
        } else if (error.code === "invalid_credentials" || msg.includes("invalid")) {
          setFormError(t("auth_invalid_credentials"));
        } else {
          setFormError(error.message);
        }
        return;
      }
      setUnconfirmedEmail(null);
      const meta = (data.user?.user_metadata ?? {}) as { user_type?: string; role?: string };
      const userRole = (meta.user_type ?? meta.role) === "accountant" ? "accountant" : "client";
      toast.success(t("toast_login_success"));
      navigate(userRole === "accountant" ? "/dashboard/accountant" : "/dashboard/client");
    } finally {
      setBusy(false);
    }
  };

  // Invalid invite screen
  if (isInvite && inviteValid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
        <Card className="p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-primary mb-2">{t("invite_link_expired_title")}</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {t("invite_link_expired_msg")}
          </p>
          <Link to="/login" className="text-primary font-semibold hover:underline">{t("invite_back_login")}</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-subtle">
      <header className="container flex items-center justify-between py-5">
        <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-smooth">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("back_home")}
        </Link>
        <LangSwitcher />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8"><Logo size={56} /></div>

          <Card className="p-6 sm:p-8 shadow-elegant border-border/50">
            <div className="mb-6 text-center">
              <div className={`inline-flex p-2 rounded-md mb-3 ${
                isInvite ? "bg-gradient-gold text-gold-foreground" : "bg-primary/10 text-primary"
              }`}>
                {isInvite ? <Building2 className="h-5 w-5" /> : <Briefcase className="h-5 w-5" />}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-2">
                {mode === "login"
                  ? t("auth_welcome_back")
                  : isInvite
                    ? t("auth_invite_title")
                    : t("auth_acc_signup_title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {mode === "login"
                  ? t("auth_login_subtitle")
                  : isInvite
                    ? (accountantName
                        ? t("auth_invite_subtitle_by").replace("{name}", accountantName)
                        : t("auth_invite_subtitle"))
                    : t("auth_acc_subtitle")}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && !(isInvite && prefillName) && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t("auth_full_name")}</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("auth_ph_full_name")} autoComplete="name" required />
                </div>
              )}
              {isInvite && prefillName && (
                <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                  <div className="font-semibold text-primary">{prefillName}</div>
                  {prefillCompany && (
                    <div className="text-xs text-muted-foreground">{prefillCompany}</div>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("auth_email")}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth_ph_email")} required autoComplete="email" readOnly={emailLocked} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("auth_password")}</Label>
                  {mode === "login" && (
                    <Link to="/forgot-password" className="text-xs text-primary hover:underline">{t("auth_forgot_password")}</Link>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    aria-describedby={mode === "signup" ? "password-hint" : undefined}
                    className="pe-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={t(showPassword ? "auth_hide_password" : "auth_show_password")}
                    className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {mode === "signup" && (
                  <p id="password-hint" className="text-xs text-muted-foreground">{t("auth_password_hint")}</p>
                )}
              </div>

              {mode === "signup" && (
                <div className="flex items-start gap-2">
                  <Checkbox id="accept-terms" checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" />
                  <Label htmlFor="accept-terms" className="text-xs font-normal leading-relaxed text-muted-foreground">
                    {t("auth_consent_prefix")}{" "}
                    <Link to="/terms" target="_blank" className="text-primary underline">{t("auth_consent_terms")}</Link>{" "}
                    {/* Arabic "و" attaches to the next word, so no space after it */}
                    {t("auth_consent_and")}{lang === "ar" ? "" : " "}
                    <Link to="/privacy" target="_blank" className="text-primary underline">{t("auth_consent_privacy")}</Link>
                  </Label>
                </div>
              )}

              {formError && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </p>
              )}

              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy || (isInvite && inviteValid === null)}>
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t(mode === "login" ? "auth_signin_btn" : "auth_signup_btn")}
              </Button>
            </form>

            {mode === "login" && unconfirmedEmail && (
              <div className="mt-4 rounded-md border border-border/60 bg-muted/40 p-3 text-sm text-center space-y-2">
                <p className="text-muted-foreground">{t("auth_email_not_confirmed")}</p>
                <Button type="button" variant="outline" size="sm" onClick={handleResend} disabled={resending}>
                  {resending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t("auth_resend_confirmation")}
                </Button>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-border/50 text-center text-sm">
              <span className="text-muted-foreground">
                {t(mode === "login" ? "auth_no_account" : "auth_have_account")}{" "}
              </span>
              <Link to={mode === "login" ? "/signup" : "/login"} className="text-primary font-semibold hover:underline">
                {t(mode === "login" ? "auth_signup_link" : "auth_signin_link")}
              </Link>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};
