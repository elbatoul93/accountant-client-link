import { useState, FormEvent, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { ArrowLeft, Briefcase, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AuthFormProps {
  mode: "login" | "signup";
  /** When set, this is a client invite signup using the given token. */
  inviteToken?: string;
}

export const AuthForm = ({ mode, inviteToken }: AuthFormProps) => {
  const { t } = useApp();
  const navigate = useNavigate();
  const params = useParams();
  const token = inviteToken ?? params.token;
  const isInvite = mode === "signup" && !!token;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteValid, setInviteValid] = useState<null | boolean>(isInvite ? null : true);
  const [accountantName, setAccountantName] = useState<string>("");

  // Validate invite token on mount
  useEffect(() => {
    if (!isInvite || !token) return;
    (async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("accountant_id, is_used, expires_at")
        .eq("token", token)
        .maybeSingle();
      if (error || !data || data.is_used || new Date(data.expires_at) < new Date()) {
        setInviteValid(false);
        return;
      }
      setInviteValid(true);
      const { data: prof } = await supabase
        .from("profiles")
        .select("name, company")
        .eq("user_id", data.accountant_id)
        .maybeSingle();
      if (prof) setAccountantName(prof.company || prof.name || "");
    })();
  }, [isInvite, token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const role = isInvite ? "client" : "accountant";
        const redirectUrl = `${window.location.origin}/`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              name: name || email.split("@")[0],
              company: company || (role === "accountant" ? "Managementik & Co." : "My Business"),
              role,
              user_type: role,
              ...(isInvite ? { invite_token: token } : {}),
            },
          },
        });
        if (error) {
          if (error.message.toLowerCase().includes("already")) {
            toast.error("An account with this email already exists. Please sign in.");
          } else if (error.message.toLowerCase().includes("invit") || error.message.toLowerCase().includes("expired")) {
            toast.error("Invite Link Expired");
          } else {
            toast.error(error.message);
          }
          return;
        }
        if (!data.session) {
          toast.success("Check your email to confirm your account, then sign in.");
          navigate("/login");
          return;
        }
        toast.success(t("toast_signup_success"));
        navigate(role === "accountant" ? "/dashboard/accountant" : "/dashboard/client");
        return;
      }

      // LOGIN
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message.includes("Invalid") ? "Invalid email or password." : error.message);
        return;
      }
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
          <h1 className="text-2xl font-bold text-primary mb-2">Invite Link Expired</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Ce lien d'invitation a déjà été utilisé ou a expiré. Veuillez demander un nouveau lien à votre comptable.
          </p>
          <Link to="/login" className="text-primary font-semibold hover:underline">Retour à la connexion</Link>
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
                    ? "Créer votre compte client"
                    : "Espace Comptable — Inscription"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {mode === "login"
                  ? t("auth_login_subtitle")
                  : isInvite
                    ? `Vous avez été invité${accountantName ? ` par ${accountantName}` : ""}. Complétez votre inscription pour accéder à votre portail.`
                    : "Cette page est réservée aux comptables. Les clients accèdent uniquement par invitation."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t("auth_full_name")}</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sarah Bennani" />
                </div>
              )}
              {mode === "signup" && isInvite && (
                <div className="space-y-1.5">
                  <Label htmlFor="company">{t("auth_company")}</Label>
                  <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme SARL" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("auth_email")}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t("auth_password")}</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>

              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy || (isInvite && inviteValid === null)}>
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t(mode === "login" ? "auth_signin_btn" : "auth_signup_btn")}
              </Button>
            </form>

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
