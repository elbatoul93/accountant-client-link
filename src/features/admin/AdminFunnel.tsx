import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

interface Funnel { signed_up: number; activated: number; first_client: number; first_g50: number; paid: number }
interface Row {
  user_id: string; name: string; email: string; company: string | null; account_status: string;
  signed_up_at: string; activated_at: string | null; first_client_at: string | null;
  first_g50_sent_at: string | null; first_payment_at: string | null; clients: number;
}

// Needs migration 20261014241000; until it is live the calls fail and the view says so.
const rpc = supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const call = (fn: string, args?: Record<string, unknown>) => rpc.call(supabase, fn, args);

const STEPS: { key: keyof Funnel; label: string }[] = [
  { key: "signed_up", label: "Signed up" },
  { key: "activated", label: "Activated" },
  { key: "first_client", label: "First client" },
  { key: "first_g50", label: "First G50 sent" },
  { key: "paid", label: "Paid" },
];

const PERIODS = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: 0 },
];

function stuckAt(r: Row): string {
  if (r.account_status !== "active") return "Activation";
  if (!r.first_client_at) return "First client";
  if (!r.first_g50_sent_at) return "First G50 sent";
  if (!r.first_payment_at) return "Paid";
  return "Done";
}

export function AdminFunnel() {
  const [days, setDays] = useState(90);

  const q = useQuery({
    queryKey: ["admin", "funnel", days],
    retry: false,
    queryFn: async () => {
      const since = days ? new Date(Date.now() - days * 86400000).toISOString() : null;
      const [f, a] = await Promise.all([
        call("admin_activation_funnel", { _since: since }),
        call("admin_activation_accountants", { _since: since }),
      ]);
      if (f.error || a.error) throw new Error("funnel unavailable");
      const first = Array.isArray(f.data) ? f.data[0] : f.data;
      return { funnel: (first ?? null) as Funnel | null, rows: (a.data ?? []) as Row[] };
    },
  });
  const funnel = q.data?.funnel ?? null;
  const rows = q.data?.rows ?? [];
  const available = !q.isError;

  if (!available) return <p className="text-sm text-muted-foreground">The activation funnel is not available yet.</p>;

  const total = funnel?.signed_up ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-primary flex-1">Activation funnel</h1>
        <select
          aria-label="Period"
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
        </select>
      </div>
      {!funnel || total === 0 ? (
        <p className="text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <Card className="p-4 space-y-3">
          {STEPS.map((s, i) => {
            const n = funnel[s.key] ?? 0;
            const prev = i > 0 ? funnel[STEPS[i - 1].key] ?? 0 : n;
            return (
              <div key={s.key}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span>
                    {n} <span className="text-muted-foreground">({Math.round((n / total) * 100)}%{i > 0 && prev > n ? `, -${prev - n}` : ""})</span>
                  </span>
                </div>
                <div className="h-2 rounded bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(n / total) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </Card>
      )}
      <Card className="divide-y divide-border/60">
        {rows.length === 0 && <p className="p-5 text-sm text-muted-foreground">No accountants in this period.</p>}
        {rows.map((r) => {
          const stuck = stuckAt(r);
          return (
            <div key={r.user_id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{r.name || r.email}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.email}{r.company ? ` · ${r.company}` : ""} · signed up {new Date(r.signed_up_at).toLocaleDateString()} · {r.clients} clients
                </div>
              </div>
              <span className={stuck === "Done" ? "text-sm text-muted-foreground" : "text-sm font-medium text-destructive"}>
                {stuck === "Done" ? "Complete" : `Stuck at: ${stuck}`}
              </span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
