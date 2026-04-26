import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, AlertTriangle, Clock } from "lucide-react";
import { buildFiscalCalendar, daysUntil, type TaxRegime } from "@/lib/accounting/calendar";

interface Props {
  t: (k: string) => string;
  regime?: TaxRegime;
  limit?: number;
}

export const FiscalCalendar = ({ t, regime, limit = 8 }: Props) => {
  const events = buildFiscalCalendar(regime).slice(0, limit);

  return (
    <Card className="p-5 shadow-card border-primary/20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> {t("fcal_title")}
        </h2>
        {regime && (
          <Badge variant="outline" className="text-[10px] border-primary/40">
            {t("fcal_regime")}: {regime}
          </Badge>
        )}
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{t("fcal_empty")}</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => {
            const days = daysUntil(e.date);
            const overdue = days < 0;
            const urgent = days >= 0 && days <= 7;
            const tone = overdue
              ? "border-destructive/40 bg-destructive/5"
              : urgent
              ? "border-gold/50 bg-gold/10"
              : "border-border bg-card";
            const icon = overdue ? AlertTriangle : urgent ? AlertTriangle : Clock;
            const Icon = icon;
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
                    <span className="text-sm font-semibold text-primary truncate">{e.label}</span>
                    <Badge variant="outline" className="text-[9px] font-mono">{e.type}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">{e.date}</p>
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
