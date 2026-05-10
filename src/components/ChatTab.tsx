import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeChat } from "./RealtimeChat";
import { Skeleton } from "@/components/ui/skeleton";

export const ChatTab = ({ role }: { role: "accountant" | "client" }) => {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);
  if (!uid) return <Skeleton className="h-[70vh] w-full" />;
  return <RealtimeChat selfId={uid} role={role} />;
};
