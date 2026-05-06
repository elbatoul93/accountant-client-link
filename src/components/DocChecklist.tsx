import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ListChecks, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";
import {
  ensureChecklist, getChecklistFor, setChecklistStatus, onPortalChange,
  DEFAULT_CHECKLIST, type ChecklistEntry,
} from "@/lib/portal";

interface Props {
  t: (k: string) => string;
  clientEmail: string;
  clientName: string;
  /** When true, renders accountant variant (validate button). */
  accountantMode?: boolean;
  monthKey?: string;
}

const labelOf = (kind: ChecklistEntry["kind"]): string =>
  DEFAULT_CHECKLIST.find((d) => d.kind === kind)?.labelFr || kind;

export const DocChecklist = ({ t, clientEmail, clientName, accountantMode, monthKey }: Props) => {
  const month = monthKey || new Date().toISOString().slice(0, 7);
  const [tick, setTick] = useState(0);
  useEffect(() => { ensureChecklist(clientEmail, clientName, month); }, [clientEmail, clientName, month]);
  useEffect(() => onPortalChange(() => setTick((x) => x + 1)), []);

  const entries = useMemo(() => getChecklistFor(clientEmail, month), [clientEmail, month, tick]);
  const received = entries.filter((e) => e.status !== "missing").length;
  const validated = entries.filter((e) => e.status === "validated").length;
  const total = entries.length || DEFAULT_CHECKLIST.length;
  const pct = total > 0 ? Math.round((received / total) * 100) : 0;

  const monthLabel = new Date(month + "-01").toLocaleDateString("fr-DZ", { month: "long", year: "numeric" });

  return (
    <Card className="p-5 shadow-card border-primary/15">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-gold-deep" /> {t("chk_title")}
        </h2>
        <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary">
          {monthLabel}
        </Badge>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <Progress value={pct} className="h-2 flex-1" />
        <span className="text-xs font-semibold text-primary tabular-nums">{received}/{total}</span>
      </div>

      <ul className="space-y-2">
        {entries.map((e) => {
          const tone = e.status === "validated"
            ? "border-success/40 bg-success/5"
            : e.status === "received"
            ? "border-gold/40 bg-gold/5"
            : "border-destructive/30 bg-destructive/5";
          const Icon = e.status === "validated" ? ShieldCheck : e.status === "received" ? CheckCircle2 : AlertCircle;
          const tone2 = e.status === "validated" ? "text-success" : e.status === "received" ? "text-gold-deep" : "text-destructive";
          return (
            <li key={e.id} className={`flex items-center gap-3 p-3 rounded-lg border ${tone}`}>
              <Icon className={`h-4 w-4 flex-shrink-0 ${tone2}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">{labelOf(e.kind)}</div>
                <div className="text-[10px] text-muted-foreground">
                  {e.status === "missing"
                    ? t("chk_status_missing")
                    : `${t(`chk_status_${e.status}`)}${e.receivedAt ? " • " + new Date(e.receivedAt).toLocaleDateString("fr-DZ") : ""}`}
                </div>
              </div>
              {accountantMode ? (
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {e.status !== "received" && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px]"
                      onClick={() => setChecklistStatus(e.id, "received")}>
                      {t("chk_mark_received")}
                    </Button>
                  )}
                  {e.status !== "validated" && (
                    <Button size="sm" variant="outlineGold" className="h-7 text-[11px]"
                      onClick={() => setChecklistStatus(e.id, "validated")}>
                      {t("chk_validate")}
                    </Button>
                  )}
                  {e.status !== "missing" && (
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                      onClick={() => setChecklistStatus(e.id, "missing")}>
                      {t("chk_reset")}
                    </Button>
                  )}
                </div>
              ) : (
                <Badge variant="outline" className={`text-[10px] ${tone2}`}>
                  {t(`chk_status_${e.status}`)}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>

      {!accountantMode && (
        <p className="text-[11px] text-muted-foreground mt-3">{t("chk_client_hint")}</p>
      )}
      {accountantMode && validated === total && total > 0 && (
        <div className="mt-3 p-2 rounded-md bg-success/10 border border-success/30 text-xs text-success font-semibold flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5" /> {t("chk_all_validated")}
        </div>
      )}
    </Card>
  );
};
