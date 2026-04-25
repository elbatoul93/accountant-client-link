import { Link, useNavigate } from "react-router-dom";
import { LangSwitcher } from "./LangSwitcher";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LayoutDashboard, LogOut } from "lucide-react";
import { toast } from "sonner";

export const SiteHeader = () => {
  const { t, user, logout } = useApp();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success(t("toast_logout"));
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center"><Logo /></Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-primary transition-smooth">{t("nav_features")}</a>
          <a href="#about" className="hover:text-primary transition-smooth">{t("nav_about")}</a>
          <a href="#pricing" className="hover:text-primary transition-smooth">{t("nav_pricing")}</a>
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <LangSwitcher />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <div className="h-8 w-8 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline">{user.name.split(" ")[0]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover w-56">
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {user.email}
                  <div className="font-semibold text-foreground capitalize mt-0.5">{t(user.role === "accountant" ? "auth_role_accountant" : "auth_role_client")}</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(user.role === "accountant" ? "/dashboard/accountant" : "/dashboard/client")}>
                  <LayoutDashboard className="me-2 h-4 w-4" /> {t("nav_dashboard")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="me-2 h-4 w-4" /> {t("nav_logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate("/login")} className="hidden sm:inline-flex">
                {t("nav_login")}
              </Button>
              <Button variant="hero" size="sm" onClick={() => navigate("/signup")}>
                {t("nav_get_started")}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
