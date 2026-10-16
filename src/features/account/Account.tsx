import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const HOLD_LABELS: Record<string, string> = {
  signed_documents: "acctset_hold_signed_documents",
  final_payroll_runs: "acctset_hold_final_payroll_runs",
  locked_periods: "acctset_hold_locked_periods",
  sent_g50: "acctset_hold_sent_g50",
  delivered_documents: "acctset_hold_delivered_documents",
  receipts: "acctset_hold_receipts",
};
interface Blocker { kind: string; n: number }
type BlockerState = { status: "loading" } | { status: "unavailable" } | { status: "ready"; held: Blocker[] };

/** Account page: download my data, and delete my account when no retention hold applies. */
const Account = () => {
  const { t, user, logout } = useApp();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [blockers, setBlockers] = useState<BlockerState>({ status: "loading" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadBlockers = useCallback(async () => {
    // Fails safe: an error (migration not applied yet, network) hides the delete button.
    const { data, error } = await supabase.rpc("my_deletion_blockers");
    if (error) { setBlockers({ status: "unavailable" }); return; }
    setBlockers({ status: "ready", held: ((data ?? []) as Blocker[]).filter((b) => b.n > 0) });
  }, []);
  useEffect(() => { loadBlockers(); }, [loadBlockers]);

  const download = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc("export_my_data");
      if (error || data == null) { toast.error(t("acctset_export_failed")); return; }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account", { body: { confirm: "DELETE" } });
      if (error) {
        let code = "";
        if (error instanceof FunctionsHttpError) {
          try { code = ((await error.context.json()) as { code?: string }).code ?? ""; } catch { /* not json */ }
        }
        toast.error(t(code === "retention_hold" ? "acctset_delete_held" : "acctset_delete_failed"));
        if (code === "retention_hold") await loadBlockers();
        setConfirmOpen(false);
        return;
      }
      await logout();
      toast.success(t("acctset_deleted"));
      navigate("/", { replace: true });
    } finally {
      setDeleting(false);
    }
  };

  const heldKinds = blockers.status === "ready" ? blockers.held : [];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container max-w-2xl py-8 space-y-6">
        <h1 className="text-2xl font-bold">{t("acctset_title")}</h1>
        {user && <p className="text-sm text-muted-foreground">{user.name} · {user.email}</p>}

        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">{t("acctset_export_title")}</h2>
          <p className="text-sm text-muted-foreground">{t("acctset_export_desc")}</p>
          <Button onClick={download} disabled={exporting}>
            <Download className="me-2 h-4 w-4" /> {t("acctset_export_btn")}
          </Button>
        </Card>

        <Card className="p-5 space-y-3 border-destructive/40">
          <h2 className="font-semibold text-destructive">{t("acctset_delete_title")}</h2>
          {blockers.status === "loading" && <p className="text-sm text-muted-foreground">…</p>}
          {blockers.status === "unavailable" && (
            <p className="text-sm text-muted-foreground">{t("acctset_delete_unavailable")}</p>
          )}
          {blockers.status === "ready" && heldKinds.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">{t("acctset_delete_held")}</p>
              <ul className="text-sm list-disc ps-5">
                {heldKinds.map((b) => <li key={b.kind}>{HOLD_LABELS[b.kind] ? t(HOLD_LABELS[b.kind]) : b.kind.replace(/_/g, " ")}</li>)}
              </ul>
            </>
          )}
          {blockers.status === "ready" && heldKinds.length === 0 && (
            <>
              <p className="text-sm text-muted-foreground">{t("acctset_delete_desc")}</p>
              <Button variant="destructive" onClick={() => { setTyped(""); setConfirmOpen(true); }}>
                <Trash2 className="me-2 h-4 w-4" /> {t("acctset_delete_btn")}
              </Button>
            </>
          )}
        </Card>
      </main>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!deleting) setConfirmOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("acctset_delete_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("acctset_delete_confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" aria-label="DELETE" autoComplete="off" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("acctset_cancel")}</AlertDialogCancel>
            <Button variant="destructive" disabled={typed !== "DELETE" || deleting} onClick={deleteAccount}>
              {t("acctset_delete_btn")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Account;
