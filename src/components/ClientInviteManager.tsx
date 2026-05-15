import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";

interface Invite {
  id: string;
  token: string;
  email: string | null;
  used: boolean;
  expires_at: string;
  created_at: string;
}

const randomToken = () => {
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
};

export const ClientInviteManager = () => {
  const { user, t } = useApp();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteToDelete, setInviteToDelete] = useState<Invite | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("invitations")
      .select("id,token,email,used,expires_at,created_at")
      .eq("accountant_id", authUser.id)
      .order("created_at", { ascending: false });
    if (!error) setInvites(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { toast.error(t("upload_session_expired")); return; }
      const token = randomToken();
      const { error } = await supabase.from("invitations").insert({
        token,
        accountant_id: authUser.id,
        email: email || null,
      });
      if (error) { toast.error(error.message); return; }
      const url = `${window.location.origin}/invite/${token}`;
      copyToClipboard(url);
      toast.success(t("invite_generated_copied"));
      setEmail("");
      load();
    } finally {
      setBusy(false);
    }
  };

  const copy = (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    copyToClipboard(url);
    toast.success(t("invite_copied"));
  };

  const confirmDelete = (inv: Invite) => {
    setInviteToDelete(inv);
  };

  const doDelete = async () => {
    if (!inviteToDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("invitations")
      .delete()
      .eq("id", inviteToDelete.id);
    if (error) {
      toast.error(t("invite_delete_error"));
    } else {
      setInvites((prev) => prev.filter((i) => i.id !== inviteToDelete.id));
      toast.success(t("acc_deleted"));
    }
    setDeleting(false);
    setInviteToDelete(null);
  };

  if (!user || user.role !== "accountant") return null;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" /> {t("invite_title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("invite_subtitle")}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          type="email"
          placeholder={t("invite_email_ph")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button onClick={generate} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Plus className="h-4 w-4 me-2" />}
          {t("invite_generate")}
        </Button>
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold mb-2">{t("invite_recent")}</h4>
        {loading ? (
          <div className="text-sm text-muted-foreground">{t("invite_loading")}</div>
        ) : invites.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("invite_empty")}</div>
        ) : (
          <ul className="space-y-2">
            {invites.map((inv) => {
              const expired = new Date(inv.expires_at) < new Date();
              const status = inv.used ? "used" : expired ? "expired" : "active";
              return (
                <li key={inv.id} className="flex items-center justify-between gap-3 p-2 rounded-md border bg-card/50">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {inv.email || t("invite_no_email")}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      /invite/{inv.token}
                    </div>
                  </div>
                  <Badge variant={status === "active" ? "default" : status === "used" ? "secondary" : "outline"}>
                    {status === "active" ? t("invite_status_active") : status === "used" ? t("invite_status_used") : t("invite_status_expired")}
                  </Badge>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copy(inv.token)}
                      disabled={status !== "active"}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => confirmDelete(inv)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog open={!!inviteToDelete} onOpenChange={(open) => { if (!open) setInviteToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invite_delete_confirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("invite_delete_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("i18n_cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("invite_delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
