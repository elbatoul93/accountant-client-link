import { Card } from "@/components/ui/card";
import { Children, cloneElement, isValidElement, useId } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Inbox } from "lucide-react";

export const InfoCell = ({ label, value, sub }: { label: string; value?: string; sub?: string }) => (
  <div className="p-3 rounded-lg bg-card border border-border/60">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="font-mono text-sm font-semibold text-foreground truncate">{value || "—"}</div>
    {sub && <div className="text-[10px] text-gold-deep mt-0.5">{sub}</div>}
  </div>
);

export const EmptyState = ({ label }: { label: string }) => (
  <div className="text-center py-10 border border-dashed border-border rounded-lg">
    <div className="inline-flex p-3 rounded-full bg-muted text-muted-foreground mb-3">
      <Inbox className="h-6 w-6" />
    </div>
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
);

export const KPI = ({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: "primary" | "gold" }) => (
  <Card className="p-4 sm:p-5 shadow-card hover:shadow-elegant transition-smooth">
    <div className={`inline-flex p-2 rounded-lg ${tone === "primary" ? "bg-primary/10 text-primary" : "bg-gold/15 text-gold-deep"}`}>
      <Icon className="h-4 w-4" />
    </div>
    <div className="text-xl sm:text-2xl font-bold mt-3 text-foreground truncate">{value}</div>
    <div className="text-xs text-muted-foreground mt-1">{label}</div>
  </Card>
);

export const Section = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
  <div>
    <div className="flex items-center gap-2 mb-2">
      <div className="p-1.5 rounded bg-primary/10 text-primary"><Icon className="h-3.5 w-3.5" /></div>
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
    </div>
    {children}
  </div>
);

export const Field = ({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) => {
  const id = useId();
  // Tie the label to a plain input/textarea so screen readers and tap-on-label work.
  const wired = Children.map(children, (child) =>
    isValidElement<{ id?: string }>(child) && (child.type === Input || child.type === Textarea) && !child.props.id
      ? cloneElement(child, { id })
      : child,
  );
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={id} className="text-xs">{label}</Label>
      {wired}
    </div>
  );
};

export const ToolCard = ({ icon: Icon, title, subtitle, cta, onClick, disabled }: {
  icon: any; title: string; subtitle: string; cta: string; onClick: () => void; disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="text-start p-4 rounded-xl border border-border/60 bg-card hover:border-gold/60 hover:shadow-gold transition-smooth disabled:opacity-50 disabled:cursor-not-allowed group"
  >
    <div className="inline-flex p-2 rounded-lg bg-gradient-gold text-gold-foreground shadow-gold mb-3 group-hover:scale-105 transition-smooth">
      <Icon className="h-4 w-4" />
    </div>
    <div className="font-semibold text-sm text-foreground mb-1">{title}</div>
    <div className="text-xs text-muted-foreground mb-3">{subtitle}</div>
    <div className="text-xs font-semibold text-gold-deep">{cta} <span className="inline-block rtl:rotate-180">→</span></div>
  </button>
);
