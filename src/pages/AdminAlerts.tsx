import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface AlertRow {
  id: string; at: string; kind: string; severity: string;
  accountant_id: string | null; detail: unknown; acknowledged_at: string | null;
}

// The alert functions arrive with migration 20261014240000; until it is live
// these calls fail and the badge and list stay empty instead of showing errors.
const rpc = supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const call = (fn: string, args?: Record<string, unknown>) => rpc.call(supabase, fn, args);

export function useOpenAlertCount() {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    const { data, error } = await call("admin_open_alert_count");
    setCount(error || typeof data !== "number" ? 0 : data);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { count, refresh };
}

const KIND_LABEL: Record<string, string> = {
  bulk_delete: "Bulk delete",
  invitation_burst: "Invitation burst",
  accountant_signup_pending: "New accountant waiting",
  admin_granted: "Admin rights granted",
  recovery_spike: "Password recovery spike",
  signup_spike: "Sign-up spike",
};

export function AdminAlerts({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await call("admin_list_security_alerts", { _only_open: true, _limit: 100 });
    if (error) { setAvailable(false); setRows([]); return; }
    setAvailable(true);
    setRows((data ?? []) as AlertRow[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const ack = async (id: string) => {
    setBusy(id);
    const { error } = await call("admin_ack_security_alert", { _id: id });
    setBusy(null);
    if (error) { toast.error("Could not acknowledge the alert."); return; }
    await load();
    onChange();
  };

  if (!available) return <p className="text-sm text-muted-foreground">Security alerts are not available yet.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-primary">Security alerts</h1>
      <Card className="divide-y divide-border/60">
        {rows.length === 0 && <p className="p-5 text-sm text-muted-foreground">No open alerts.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{KIND_LABEL[r.kind] ?? r.kind}</div>
              <div className="text-xs text-muted-foreground break-words">
                {new Date(r.at).toLocaleString()}
                {r.detail ? ` · ${typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail)}` : ""}
              </div>
            </div>
            <Badge variant={r.severity === "critical" ? "destructive" : "outline"}>{r.severity}</Badge>
            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => ack(r.id)}>Acknowledge</Button>
          </div>
        ))}
      </Card>
    </div>
  );
}
