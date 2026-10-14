import { useState } from "react";
import { Check, Circle, FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Client, Decl, Invoice } from "@/pages/accountant/shared";

// Fixed, valid UUIDs: the database columns for client ids and invoice ids reject anything else (22P02).
export const DEMO_CLIENT_ID = "0d3e0000-0000-4000-8000-000000000001";
/** Example data loaded before the ids were fixed used this id; still recognised so it can be removed. */
const LEGACY_DEMO_CLIENT_ID = "demo-client";
export const isDemoClient = (id: string) => id === DEMO_CLIENT_ID || id === LEGACY_DEMO_CLIENT_ID;
const DEMO_INVOICE_ID = "0d3e0000-0000-4000-8000-000000000002";
const DISMISS_KEY = "onboarding_dismissed";

const readDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } };

/** A clearly labelled example client and invoice so a new firm can see the screens filled in. */
export const buildSampleData = (): { client: Client; invoice: Invoice } => ({
  client: {
    id: DEMO_CLIENT_ID, name: "Exemple SARL (démo)", company: "Exemple SARL (démo)",
    taxId: "000000000000000", contact: "demo@example.invalid", status: "active", taxRegime: "REEL",
    legalForm: "SARL", activity: "Négoce",
  },
  invoice: {
    id: DEMO_INVOICE_ID, clientId: DEMO_CLIENT_ID, clientName: "Exemple SARL (démo)",
    amount: 120000, date: new Date().toISOString().slice(0, 10), status: "pending",
  },
});

interface Props {
  t: (k: string) => string;
  clients: Client[]; invoices: Invoice[]; decls: Decl[];
  hasProfile: boolean; hasInvitedClient: boolean;
  onAddClient: () => void; onGoClients: () => void; onGoObligations: () => void;
  onAddSample: () => void; onRemoveSample: () => void;
}

export const OnboardingChecklist = ({
  t, clients, invoices, decls, hasProfile, hasInvitedClient,
  onAddClient, onGoClients, onGoObligations, onAddSample, onRemoveSample,
}: Props) => {
  const [hidden, setHidden] = useState(readDismissed);
  const real = clients.filter((c) => !isDemoClient(c.id));
  const hasSample = clients.some((c) => isDemoClient(c.id));
  const steps = [
    { key: "profile", done: hasProfile, action: undefined as (() => void) | undefined },
    { key: "client", done: real.length > 0, action: onAddClient },
    { key: "invite", done: hasInvitedClient, action: onGoClients },
    { key: "invoice", done: invoices.some((i) => !isDemoClient(i.clientId)), action: onGoClients },
    { key: "decl", done: decls.some((d) => !isDemoClient(d.clientId)), action: onGoObligations },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (hidden || doneCount === steps.length) return null;

  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage blocked */ } setHidden(true); };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-primary">{t("onb_title")}</h2>
          <p className="text-xs text-muted-foreground">{doneCount}/{steps.length} · {t("onb_subtitle")}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label={t("onb_dismiss")} onClick={dismiss}><X className="h-4 w-4" /></Button>
      </div>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            {s.done ? <Check className="h-4 w-4 text-success shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
            <span className={s.done ? "text-muted-foreground line-through" : "flex-1"}>{t(`onb_step_${s.key}`)}</span>
            {!s.done && s.action && <Button size="sm" variant="outline" onClick={s.action}>{t("onb_go")}</Button>}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground flex-1">{t("onb_sample_hint")}</span>
        {hasSample
          ? <Button size="sm" variant="outline" onClick={onRemoveSample}>{t("onb_sample_remove")}</Button>
          : <Button size="sm" variant="outline" onClick={onAddSample}>{t("onb_sample_add")}</Button>}
      </div>
    </Card>
  );
};
