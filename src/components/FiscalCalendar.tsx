import { useEffect, useState } from "react";
import { interpolate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, AlertTriangle, Clock, Timer } from "lucide-react";
import {
  buildFiscalCalendar, daysUntil, nextG50Deadline, type TaxRegime,
} from "@/lib/accounting/calendar";

interface Props {
  t: (k: string) => string;
  regime?: TaxRegime;
  limit?: number;
  employeeCount?: number;
  hasCacobatph?: boolean;
}

const fmtCountdown = (ms: number) => {
  if (ms <= 0) return "00d 00:00:00";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d)}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
};

export const FiscalCalendar = ({ t, regime, limit = 8, employeeCount, hasCacobatph }: Props) => {
  const events = buildFiscalCalendar(regime, new Date(), { employeeCount, hasCacobatph }).slice(0, limit);

  // G50 live countdown — refresh every second
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const g50 = nextG50Deadline(now);
  const g50Ms = g50.due.getTime() - now.getTime();
  const g50Open = now.getTime() >= g50.open.getTime();
  const g50Urgent = g50Ms < 5 * 86400000;

  return (
    <Card className="p-5 shadow-card border-primary/20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> {t("fcal_title")}
        </h2>
        <div className="flex items-center gap-2">
          {typeof employeeCount === "number" && (
            <Badge variant="outline" className="text-[10px] border-primary/40">
              {t("fcal_employees")}: {employeeCount} ({employeeCount >= 10 ? t("fcal_freq_monthly") : t("fcal_freq_quarterly")})
            </Badge>
          )}
          {regime && (
            <Badge variant="outline" className="text-[10px] border-primary/40">
              {t("fcal_regime")}: {regime}
            </Badge>
          )}
        </div>
      </div>

      {/* G50 countdown banner */}
      <div className={`mb-4 rounded-lg border p-3 flex items-center gap-3 ${
        g50Ms < 0 ? "border-destructive/50 bg-destructive/5"
        : g50Urgent ? "border-gold/50 bg-gold/10"
        : "border-primary/30 bg-primary/5"
      }`}>
        <div className={`h-9 w-9 rounded-md flex items-center justify-center ${
          g50Ms < 0 ? "bg-destructive/15 text-destructive"
          : g50Urgent ? "bg-gold/20 text-gold-deep"
          : "bg-primary/10 text-primary"
        }`}>
          <Timer className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-primary">{t("fcal_g50_countdown")}</div>
          <div className="text-[11px] text-muted-foreground font-mono">
            {t("fcal_g50_window")}: {g50.open.toISOString().slice(0, 10)} → {g50.due.toISOString().slice(0, 10)}
            {!g50Open && <span className="ms-2">· {t("fcal_g50_not_open")}</span>}
          </div>
        </div>
        <div className={`text-sm font-bold font-mono ${g50Ms < 0 ? "text-destructive" : g50Urgent ? "text-gold-deep" : "text-primary"}`}>
          {g50Ms < 0 ? t("fcal_overdue") : fmtCountdown(g50Ms)}
        </div>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{t("fcal_empty")}</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => {
            const days = daysUntil(e.date);
            const overdue = days < 0;
            const urgent = days >= 0 && days <= 5;
            const tone = overdue
              ? "border-destructive/40 bg-destructive/5"
              : urgent
              ? "border-gold/50 bg-gold/10"
              : "border-border bg-card";
            const Icon = overdue || urgent ? AlertTriangle : Clock;
            return (
              <li key={e.id} className={`flex items-center gap-3 p-3 rounded-lg border ${tone}`}>
                <div className={`h-9 w-9 rounded-md flex items-center justify-center ${
                  overdue ? "bg-destructive/15 text-destructive" :
                  urgent ? "bg-gold/20 text-gold-deep" : "bg-primary/10 text-primary"
                }`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-primary truncate">{e.labelKey ? interpolate(t(e.labelKey), e.labelParams) : e.label}</span>
                    <Badge variant="outline" className="text-[9px] font-mono">{e.type}</Badge>
                    {e.quarterly && <Badge variant="outline" className="text-[9px] font-mono border-gold/40 text-gold-deep">{t("fcal_freq_quarterly")}</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {e.openDate ? `${e.openDate} → ${e.date}` : e.date}
                  </p>
                </div>
                <div className="text-end">
                  <div className={`text-sm font-bold font-mono ${overdue ? "text-destructive" : urgent ? "text-gold-deep" : "text-muted-foreground"}`}>
                    {overdue ? `${Math.abs(days)} j ${t("fcal_overdue")}` : days === 0 ? t("fcal_today") : `J-${days}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};
