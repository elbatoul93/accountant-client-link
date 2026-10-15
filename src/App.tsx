import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/contexts/AppContext";
import Index from "./features/landing/Index.tsx";
import Login from "./features/auth/Login.tsx";
import Signup from "./features/auth/Signup.tsx";
import InviteSignup from "./features/auth/InviteSignup.tsx";
import NotFound from "./features/landing/NotFound.tsx";
import RecoveryRedirect from "./features/auth/RecoveryRedirect";
import ProtectedRoute from "./features/auth/ProtectedRoute";
import Privacy from "./features/legal/Privacy.tsx";
import Terms from "./features/legal/Terms.tsx";
import Help from "./features/help/Help.tsx";
import ForgotPassword from "./features/auth/ForgotPassword.tsx";
import ResetPassword from "./features/auth/ResetPassword.tsx";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";

const Account = lazy(() => import("./features/account/Account.tsx"));
const AccountantDashboard = lazy(() => import("./features/accountant/AccountantDashboard.tsx"));
const Admin = lazy(() => import("./features/admin/Admin.tsx"));
const ClientDashboard = lazy(() => import("./features/client/ClientDashboard.tsx"));

const PageSpinner = () => (
  <div className="min-h-screen grid place-items-center bg-background">
    <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <RecoveryRedirect />
          <ErrorBoundary>
          <Suspense fallback={<PageSpinner />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/help" element={<Help />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/invite/:token" element={<InviteSignup />} />
            <Route path="/dashboard/accountant" element={<ProtectedRoute role="accountant"><AccountantDashboard /></ProtectedRoute>} />
            <Route path="/dashboard/client" element={<ProtectedRoute role="client"><ClientDashboard /></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </AppProvider>
  </QueryClientProvider>
);

export default App;
