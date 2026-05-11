import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useApp, Role } from "@/contexts/AppContext";

interface ProtectedRouteProps {
  children: ReactNode;
  role?: Role;
}

const FullScreenSpinner = () => (
  <div className="min-h-screen grid place-items-center bg-background">
    <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
  </div>
);

const ProtectedRoute = ({ children, role }: ProtectedRouteProps) => {
  const { user, loading } = useApp();

  // Hold the router while the session is being restored from storage.
  if (loading) return <FullScreenSpinner />;

  if (!user) return <Navigate to="/login" replace />;

  if (role && user.role !== role) {
    return <Navigate to={user.role === "accountant" ? "/dashboard/accountant" : "/dashboard/client"} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
