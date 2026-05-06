import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { buildFiscalCalendar, tonalStatus, type DeadlineTone, type TaxRegime } from "@/lib/accounting/calendar";

interface Props {
  t: (k: string) => string;
  regime?: TaxRegime;
  employeeCount?: number;
  hasCacobatph?: boolean;
  /** Override tone (e.g. when checklist data implies overdue). */
  toneOverride?: DeadlineTone;
}

/**
 * Visual status indicator used on client lists.
 *  Green  = safe (no deadline within 5 days)
 *  Orange = deadline within 5 days
 *  Red    = at least one overdue deadline
 */
export const ClientStatusIcon = ({ t, regime, employeeCount, hasCacobatph, toneOverride }: Props) => {
  const events = buildFiscalCalendar(regime, new Date(), { employeeCount, hasCacobatph });
  const tone: DeadlineTone = toneOverride ?? tonalStatus(events);
  const map = {
    safe: { Icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-500/10", label: t("status_safe") },
    warning: { Icon: AlertTriangle, cls: "text-gold-deep bg-gold/15", label: t("status_warning") },
    overdue: { Icon: AlertCircle, cls: "text-destructive bg-destructive/10", label: t("status_overdue") },
  } as const;
  const { Icon, cls, label } = map[tone];
  return (
    <span title={label} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
};
