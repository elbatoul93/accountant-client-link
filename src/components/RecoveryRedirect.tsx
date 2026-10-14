import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Sends a user who followed a password-recovery email link to /reset-password, whichever page
 * Supabase redirected them to (e.g. the site root when /reset-password is not in the project's
 * redirect allow-list). Renders nothing.
 */
const RecoveryRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const go = () => navigate("/reset-password", { replace: true });
    // The link's hash is present on first render, before Supabase has emitted any event, and this
    // wins the race against the "signed in, leave /login" redirects.
    if (window.location.pathname !== "/reset-password" && window.location.hash.includes("type=recovery")) go();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") go();
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  return null;
};

export default RecoveryRedirect;
