import { useFormat } from "@/hooks/useFormat";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Trash2, Download, FileCheck2, Clock, Eye, ListChecks, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { ChatTab } from "@/components/ChatTab";
import { DocChecklist } from "@/components/DocChecklist";
import { type IncomingInvoice, type VaultEntry } from "@/lib/portal";
import { Archive, Inbox as InboxIcon, FileSignature } from "lucide-react";
import { Client } from "@/pages/accountant/shared";
import { EmptyState } from "@/pages/accountant/ui";

export const IncomingDocsView = ({ t, items, onMarkProcessed, onDelete, onPreview }: {
  t: (k: string) => string; items: IncomingInvoice[];
  onMarkProcessed: (id: string) => void; onDelete: (id: string) => void;
  onPreview: (it: IncomingInvoice) => void;
}) => {
  return (
    <Card className="p-5 shadow-card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          <InboxIcon className="h-4 w-4 text-gold-deep" /> {t("incoming_title")}
        </h2>
        <Badge variant="secondary" className="text-xs">{items.length}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t("incoming_subtitle")}</p>
      {items.length === 0 ? (
        <EmptyState label={t("incoming_empty")} />
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const statusBadge =
              it.status === "pending" ? <Badge className="bg-warning/15 text-warning-foreground border-warning/40 text-[10px]"><Clock className="h-3 w-3 me-1" /> {t("incoming_pending")}</Badge>
              : it.status === "processed" ? <Badge className="bg-success/15 text-success border-success/40 text-[10px]"><FileCheck2 className="h-3 w-3 me-1" /> {t("incoming_processed")}</Badge>
              : <Badge variant="outline" className="text-[10px]">{t("incoming_review")}</Badge>;
            return (
              <div key={it.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/40 transition-smooth">
                <div className="p-2 rounded-md bg-primary/10 text-primary flex-shrink-0">
                  {it.mimeType.startsWith("image/") ? <FileText className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{it.fileName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("incoming_from")} <span className="font-medium">{it.clientName}</span> • {(it.size / 1024).toFixed(0)} KB • {new Date(it.uploadedAt).toLocaleString("fr-DZ")}
                  </div>
                </div>
                {statusBadge}
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onPreview(it)}>
                  <Eye className="h-3.5 w-3.5" /> {t("preview_btn")}
                </Button>
                {it.fileData && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                    const a = document.createElement("a");
                    a.href = it.fileData!; a.download = it.fileName; a.target = "_blank"; a.click();
                  }} title={t("incoming_open_file")} aria-label={t("incoming_open_file")}>
                    <Download className="h-3.5 w-3.5 text-gold-deep" />
                  </Button>
                )}
                {it.status !== "processed" && (
                  <Button size="sm" variant="outlineGold" onClick={() => { onMarkProcessed(it.id); toast.success(t("incoming_processed")); }}>
                    {t("incoming_mark_processed")}
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(it.id)} aria-label={t("common_delete")}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export const AccountantVaultView = ({ t, entries }: { t: (k: string) => string; entries: VaultEntry[] }) => {
  const fmt = useFormat();
  const groups = useMemo(() => {
    const m = new Map<string, VaultEntry[]>();
    for (const e of entries) {
      const arr = m.get(e.monthKey) || [];
      arr.push(e); m.set(e.monthKey, arr);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  return (
    <Card className="p-5 shadow-card">
      <h2 className="text-lg font-bold text-primary mb-1 flex items-center gap-2">
        <Archive className="h-4 w-4 text-gold-deep" /> {t("vault_title")}
      </h2>
      <p className="text-xs text-muted-foreground mb-5">{t("vault_subtitle")}</p>
      {entries.length === 0 ? (
        <EmptyState label={t("vault_empty")} />
      ) : (
        <div className="space-y-5">
          {groups.map(([month, items]) => (
            <div key={month}>
              <div className="text-xs uppercase tracking-wide font-bold text-primary mb-2 border-b border-border/60 pb-1">
                {fmt.date(month + "-01", { month: "long", year: "numeric" })}
                <Badge variant="secondary" className="ms-2 text-[10px]">{items.length}</Badge>
              </div>
              <div className="space-y-1.5">
                {items.map((e) => (
                  <div key={e.id} className="flex items-center justify-between p-2.5 rounded border border-border/60 text-xs hover:border-primary/40 transition-smooth">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Badge variant="outline" className="font-mono text-[10px]">{e.type}</Badge>
                      <span className="font-medium truncate">{e.label}</span>
                      <span className="text-muted-foreground hidden sm:inline">— {e.clientName}</span>
                      {e.kind === "shared_doc" && (
                        e.signed ? (
                          <Badge className="bg-success/15 text-success border-success/40 text-[10px]">
                            <FileSignature className="h-3 w-3 me-0.5" /> {t("vault_signed")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{t("vault_unsigned")}</Badge>
                        )
                      )}
                    </div>
                    <span className="text-muted-foreground text-[11px] ms-2 flex-shrink-0">
                      {fmt.date(e.date)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export const TrackingView = ({ t, clients, activeId, setActiveId }: {
  t: (k: string) => string; clients: Client[];
  activeId: string; setActiveId: (id: string) => void;
}) => {
  const active = clients.find((c) => c.id === activeId);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-gold-deep" /> {t("acc_tracking_title")}
        </h1>
        <p className="text-xs text-muted-foreground">{t("acc_tracking_subtitle")}</p>
      </div>

      <Card className="p-4 shadow-card">
        <Label className="text-xs">{t("dash_client")}</Label>
        <Select value={activeId} onValueChange={setActiveId}>
          <SelectTrigger><SelectValue placeholder={t("acc_select_client")} /></SelectTrigger>
          <SelectContent>
            {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </Card>

      {active ? (
        <DocChecklist t={t} clientEmail={active.contact} clientName={active.name} accountantMode />
      ) : (
        <Card className="p-8 shadow-card text-center text-sm text-muted-foreground">
          {t("acc_select_client")}
        </Card>
      )}
    </div>
  );
};

export const ChatHubView = ({ t, preselectId }: { t: (k: string) => string; preselectId?: string | null }) => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-gold-deep" /> {t("chat_title")}
        </h1>
        <p className="text-xs text-muted-foreground">{t("chat_select_contact")}</p>
      </div>
      <ChatTab role="accountant" preselectId={preselectId} />
    </div>
  );
};
