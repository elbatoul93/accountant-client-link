import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useApp, Role } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: ReactNode;
  role?: Role;
}

const FullScreenSpinner = () => (
  <div className="min-h-screen grid place-items-center bg-background">
    <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
  </div>
);

/** Shown instead of the accountant dashboard until an admin activates (or after suspending) the account. */
const InactiveAccount = ({ suspended }: { suspended: boolean }) => {
  const { t, logout } = useApp();
  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="max-w-sm text-center space-y-3" role="status">
        <h1 className="text-xl font-bold text-primary">
          {t(suspended ? "acct_suspended_title" : "acct_pending_title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(suspended ? "acct_suspended_msg" : "acct_pending_msg")}
        </p>
        <Button variant="outline" onClick={() => logout()}>{t("nav_logout")}</Button>
      </div>
    </div>
  );
};

const ProtectedRoute = ({ children, role }: ProtectedRouteProps) => {
  const { user, loading } = useApp();

  // Hold the router while the session is being restored from storage.
  if (loading) return <FullScreenSpinner />;

  if (!user) return <Navigate to="/login" replace />;

  if (user.role === "accountant" && user.accountStatus && user.accountStatus !== "active") {
    return <InactiveAccount suspended={user.accountStatus === "suspended"} />;
  }

  if (role && user.role !== role) {
    return <Navigate to={user.role === "accountant" ? "/dashboard/accountant" : "/dashboard/client"} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
