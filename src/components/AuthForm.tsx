import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import type { Role } from "@/contexts/AppContext";

interface AuthFormProps { mode: "login" | "signup" }

export const AuthForm = ({ mode }: AuthFormProps) => {
  const { t } = useApp();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
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
            },
          },
        });
        if (error) {
          if (error.message.toLowerCase().includes("already")) {
            toast.error("An account with this email already exists. Please sign in.");
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
      // Look up role to choose redirect target
      const uid = data.user!.id;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const userRole: Role = roles?.some((r) => r.role === "accountant") ? "accountant" : "client";
      toast.success(t("toast_login_success"));
      navigate(userRole === "accountant" ? "/dashboard/accountant" : "/dashboard/client");
    } finally {
      setBusy(false);
    }
  };

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
              <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-2">
                {t(mode === "login" ? "auth_welcome_back" : "auth_create_account")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(mode === "login" ? "auth_login_subtitle" : "auth_signup_subtitle")}
              </p>
            </div>

            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3 mb-5">
                <RoleCard
                  active={role === "client"}
                  onClick={() => setRole("client")}
                  icon={<Building2 className="h-5 w-5" />}
                  title={t("auth_role_client")}
                  desc={t("auth_role_client_desc")}
                />
                <RoleCard
                  active={role === "accountant"}
                  onClick={() => setRole("accountant")}
                  icon={<Briefcase className="h-5 w-5" />}
                  title={t("auth_role_accountant")}
                  desc={t("auth_role_accountant_desc")}
                />
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t("auth_full_name")}</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sarah Bennani" />
                </div>
              )}
              {mode === "signup" && role === "client" && (
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

              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}>
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

const RoleCard = ({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-start p-3 rounded-lg border-2 transition-smooth ${
      active ? "border-primary bg-primary/5 shadow-card" : "border-border hover:border-primary/40"
    }`}
  >
    <div className={`inline-flex p-1.5 rounded-md mb-2 ${active ? "bg-gradient-gold text-gold-foreground" : "bg-muted text-muted-foreground"}`}>
      {icon}
    </div>
    <div className="font-semibold text-sm text-foreground">{title}</div>
    <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{desc}</div>
  </button>
);
