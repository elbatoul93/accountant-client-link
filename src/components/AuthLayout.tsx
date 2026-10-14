import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { LangSwitcher } from "@/components/LangSwitcher";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/** Shared shell for the small auth pages (forgot / reset password). */
export const AuthLayout = ({ title, subtitle, children }: AuthLayoutProps) => {
  const { t } = useApp();
  return (
    <div className="min-h-screen flex flex-col bg-gradient-subtle">
      <header className="container flex items-center justify-between py-5">
        <Link to="/login" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-smooth">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("invite_back_login")}
        </Link>
        <LangSwitcher />
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8"><Logo size={56} /></div>
          <Card className="p-6 sm:p-8 shadow-elegant border-border/50">
            <div className="mb-6 text-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-2">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
          </Card>
        </div>
      </main>
    </div>
  );
};
