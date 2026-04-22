import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { ArrowLeft, Briefcase, Building2 } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@/contexts/AppContext";

interface AuthFormProps { mode: "login" | "signup" }

export const AuthForm = ({ mode }: AuthFormProps) => {
  const { t, login } = useApp();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    const displayName =
      mode === "signup"
        ? name || email.split("@")[0]
        : email.split("@")[0].replace(/[^a-zA-Z]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Demo User";
    login({
      name: displayName,
      email,
      role,
      company: company || (role === "accountant" ? "Managementik & Co." : "My Business"),
    });
    toast.success(t(mode === "signup" ? "toast_signup_success" : "toast_login_success"));
    navigate(role === "accountant" ? "/dashboard/accountant" : "/dashboard/client");
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
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>

              {mode === "login" && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setRole("client")}
                    className={role === "client" ? "border-primary text-primary" : ""}>
                    <Building2 className="h-4 w-4" /> {t("auth_role_client")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setRole("accountant")}
                    className={role === "accountant" ? "border-primary text-primary" : ""}>
                    <Briefcase className="h-4 w-4" /> {t("auth_role_accountant")}
                  </Button>
                </div>
              )}

              <Button type="submit" variant="hero" size="lg" className="w-full">
                {t(mode === "login" ? "auth_signin_btn" : "auth_signup_btn")}
              </Button>

              <p className="text-xs text-center text-muted-foreground italic">{t("auth_demo_hint")}</p>
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
