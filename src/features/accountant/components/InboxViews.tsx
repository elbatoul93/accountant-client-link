import { useFormat } from "@/hooks/useFormat";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListChecks, MessageCircle } from "lucide-react";
import { ChatTab } from "@/features/chat/ChatTab";
import { DocChecklist } from "@/components/common/DocChecklist";
import { type VaultEntry } from "@/lib/vault";
import { Archive, FileSignature } from "lucide-react";
import { Client } from "@/features/accountant/components/shared";
import { EmptyState } from "@/features/accountant/components/ui";

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
                    <span className="text-muted-foreground text-[11px] ms-2 shrink-0">
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
        <DocChecklist t={t} clientRef={active.id} accountantMode />
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
