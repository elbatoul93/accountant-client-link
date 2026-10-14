import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Hook: true only when the database confirms the caller is an admin. Any error counts as "not admin". */
export const useIsAdmin = (enabled = true) => {
  const [state, setState] = useState<"loading" | "yes" | "no">(enabled ? "loading" : "no");
  useEffect(() => {
    if (!enabled) { setState("no"); return; }
    let cancelled = false;
    supabase.rpc("is_admin")
      .then(({ data, error }) => { if (!cancelled) setState(!error && data === true ? "yes" : "no"); })
      .then(undefined, () => { if (!cancelled) setState("no"); });
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
};
