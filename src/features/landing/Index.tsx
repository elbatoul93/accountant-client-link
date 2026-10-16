import { Navigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { FullScreenSpinner } from "@/features/auth/ProtectedRoute";
import Landing from "./Landing";

/** The home page is for visitors; a signed-in user goes straight to their dashboard (same target as login). */
const Index = () => {
  const { user, loading } = useApp();
  // Hold while the session is restored so a signed-in user never sees the landing page flash.
  if (loading) {
    return <FullScreenSpinner />;
  }
  if (user) {
    return <Navigate to={user.role === "accountant" ? "/dashboard/accountant" : "/dashboard/client"} replace />;
  }
  return <Landing />;
};
export default Index;
