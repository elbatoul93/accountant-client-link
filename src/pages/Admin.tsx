import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminBilling } from "@/pages/AdminBilling";
import { AdminFunnel } from "@/pages/AdminFunnel";
import { AdminAlerts, useOpenAlertCount } from "@/pages/AdminAlerts";

type Status = "pending" | "active" | "suspended";
interface AccountantRow {
  user_id: string; name: string; email: string; company: string | null; account_status: string; created_at: string;
}

// Operator-only screen (not translated): activate or suspend accountant accounts.
const Admin = () => {
  const admin = useIsAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  const alerts = useOpenAlertCount();

  const list = useQuery({
    queryKey: ["admin", "accountants"],
    enabled: admin === "yes",
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_accountants");
      if (error) throw error;
      return (data ?? []) as AccountantRow[];
    },
  });
  const rows = list.data ?? [];
  const failed = list.isError;
  const load = () => list.refetch();

  const setStatus = async (id: string, status: Status) => {
    setBusy(id);
    const { error } = await supabase.rpc("admin_set_accountant_status", { _user_id: id, _status: status });
    setBusy(null);
    if (error) { toast.error("Could not update the account."); return; }
    toast.success(status === "active" ? "Account activated." : status === "suspended" ? "Account suspended." : "Account set to pending.");
    await load();
  };

  if (admin === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }
  if (admin === "no") return <Navigate to="/" replace />;

  const pending = rows.filter((r) => r.account_status === "pending").length;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <SiteHeader />
      <main className="container max-w-4xl py-8 space-y-4" dir="ltr" lang="en">
        <Tabs defaultValue="accounts">
          <TabsList>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="billing">Plans and receipts</TabsTrigger>
            <TabsTrigger value="funnel">Activation funnel</TabsTrigger>
            <TabsTrigger value="alerts" className="gap-2">
              Security alerts
              {alerts.count > 0 && <Badge variant="destructive">{alerts.count}</Badge>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="accounts" className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Accountant accounts</h1>
          <p className="text-sm text-muted-foreground">{pending} waiting for activation</p>
        </div>
        {failed && <p role="alert" className="text-sm text-destructive">Could not load the list. Reload the page.</p>}
        <Card className="divide-y divide-border/60">
          {rows.length === 0 && !failed && <p className="p-5 text-sm text-muted-foreground">No accountant accounts yet.</p>}
          {rows.map((r) => (
            <div key={r.user_id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{r.name || r.email}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.email}{r.company ? ` · ${r.company}` : ""} · {new Date(r.created_at).toLocaleDateString()}
                </div>
              </div>
              <Badge variant={r.account_status === "active" ? "secondary" : "outline"}>{r.account_status}</Badge>
              {r.account_status !== "active" && (
                <Button size="sm" variant="hero" disabled={busy === r.user_id} onClick={() => setStatus(r.user_id, "active")}>
                  Activate
                </Button>
              )}
              {r.account_status === "active" && (
                <Button size="sm" variant="outline" disabled={busy === r.user_id} onClick={() => setStatus(r.user_id, "suspended")}>
                  Suspend
                </Button>
              )}
            </div>
          ))}
        </Card>
          </TabsContent>
          <TabsContent value="billing"><AdminBilling /></TabsContent>
          <TabsContent value="funnel"><AdminFunnel /></TabsContent>
          <TabsContent value="alerts"><AdminAlerts onChange={alerts.refresh} /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
