import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";

/** Hook: true only when the database confirms the caller is an admin. Any error counts as "not admin". */
export const useIsAdmin = (enabled = true): "loading" | "yes" | "no" => {
  const { user } = useApp();
  const q = useQuery({
    // Keyed by account so a different sign-in never sees the previous answer.
    queryKey: ["is_admin", user?.email ?? null],
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_admin");
      return !error && data === true;
    },
  });
  if (!enabled) return "no";
  if (q.isPending) return "loading";
  return q.data === true ? "yes" : "no";
};
