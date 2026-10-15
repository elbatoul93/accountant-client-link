import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { WORKFLOW_ORDER, type WorkflowStatus as WStatus } from "@/lib/portal";

const STYLES: Record<WStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  review: "bg-warning/15 text-warning-foreground border-warning/40",
  sent: "bg-primary/15 text-primary border-primary/40",
  signed: "bg-gold/20 text-gold-deep border-gold/40",
  filed: "bg-success/15 text-success border-success/40",
};

export const WorkflowBadge = ({ status, t }: { status?: WStatus; t: (k: string) => string }) => {
  const s: WStatus = status ?? "draft";
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold ${STYLES[s]}`}>
      {t(`wf_${s}`)}
    </Badge>
  );
};

interface StepperProps {
  status?: WStatus;
  t: (k: string) => string;
  onChange?: (next: WStatus) => void;
  /** Disable transitions (read-only stepper). */
  readOnly?: boolean;
}

export const WorkflowStepper = ({ status, t, onChange, readOnly }: StepperProps) => {
  const current = WORKFLOW_ORDER.indexOf(status ?? "draft");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 flex-wrap">
        {WORKFLOW_ORDER.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={s} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-semibold ${
                done ? "bg-success/15 text-success border-success/40"
                : active ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-border"
              }`}>
                {done && <Check className="h-3 w-3" />}
                {t(`wf_${s}`)}
              </div>
              {i < WORKFLOW_ORDER.length - 1 && <div className="h-px w-3 bg-border" />}
            </div>
          );
        })}
      </div>
      {!readOnly && onChange && (
        <div className="flex items-center gap-1 flex-wrap">
          {WORKFLOW_ORDER.map((s) => (
            <Button
              key={s} size="sm" variant={s === status ? "gold" : "outline"}
              className="h-6 px-2 text-[10px]"
              onClick={() => onChange(s)}
            >
              {t(`wf_${s}`)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};
