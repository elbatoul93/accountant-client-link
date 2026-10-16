import { useMemo, useState } from "react";
import { useFmtDZD } from "@/lib/useFormat";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scale, TrendingUp, TrendingDown, Receipt, ShieldCheck } from "lucide-react";
import {
  type JournalLine, type PeriodLock,
  computeTrialBalance, computeBilan, computeTCR, computeG50FromJournal,
} from "@/lib/accounting/engine";
import { prevPeriod } from "@/lib/accounting/algerianTax";
import { useIbsPrior } from "@/features/accountant/lib/useIbsPrior";
import { type PrecompteMap, precompteKey } from "./SuiteModules";


interface ClientLite { id: string; name: string }

interface Props {
  t: (k: string) => string;
  journal: JournalLine[];
  locks: PeriodLock[];
  clients: ClientLite[];
  precompte?: PrecompteMap;
}

export const ReportsView = ({ t, journal, locks, clients, precompte = {} }: Props) => {
  const fmtDZD = useFmtDZD();
  const [clientId, setClientId] = useState<string>("ALL");
  const [period, setPeriod] = useState<string>(new Date().toISOString().slice(0, 7));
  const from = `${period}-01`;
  const to = `${period}-31`;

  const filter = useMemo(
    () => ({ clientId: clientId === "ALL" ? undefined : clientId, from, to }),
    [clientId, from, to],
  );

  const trial = useMemo(() => computeTrialBalance(journal, filter), [journal, filter]);
  const bilan = useMemo(() => computeBilan(journal, { clientId: filter.clientId, to }), [journal, filter.clientId, to]);
  const tcr = useMemo(() => computeTCR(journal, filter), [journal, filter]);
  const { value: ibsPrior, setValue: setIbsPrior, save: saveIbsPrior } = useIbsPrior(filter.clientId, Number(period.slice(0, 4)));
  const precompteFromPrev = precompte[precompteKey(filter.clientId, prevPeriod(period))] ?? 0;
  const g50 = useMemo(
    () => computeG50FromJournal(journal, {
      clientId: filter.clientId, period, precompteFromPrev, ibsPriorYear: Number(ibsPrior) || 0,
    }),
    [journal, filter.clientId, period, precompteFromPrev, ibsPrior],
  );

  const totalDebit = trial.reduce((s, r) => s + r.debit, 0);
  const totalCredit = trial.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 1;

  const lockKey = `${filter.clientId ?? "_"}__${period}`;
  const isLocked = locks.some((l) => l.key === lockKey);

  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-card">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5 min-w-[180px]">
            <Label className="text-xs">{t("dash_client")}</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("rep_all_clients")}</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("rep_period")}</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" />
          </div>
          <div className="ms-auto flex items-center gap-2">
            {isLocked && (
              <Badge variant="outline" className="border-gold-deep/40 text-gold-deep bg-gold/5 gap-1">
                <ShieldCheck className="h-3 w-3" /> {t("rep_period_locked")}
              </Badge>
            )}
            <Badge variant="outline" className={balanced ? "border-primary/40 text-primary bg-primary/5" : "border-destructive/40 text-destructive bg-destructive/5"}>
              <Scale className="h-3 w-3 me-1" />
              {balanced ? t("rep_balanced") : t("rep_unbalanced")}
            </Badge>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="trial">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="trial">{t("rep_tab_trial")}</TabsTrigger>
          <TabsTrigger value="bilan">{t("rep_tab_bilan")}</TabsTrigger>
          <TabsTrigger value="tcr">{t("rep_tab_tcr")}</TabsTrigger>
          <TabsTrigger value="g50">{t("rep_tab_g50")}</TabsTrigger>
        </TabsList>

        {/* ===== Trial Balance ===== */}
        <TabsContent value="trial" className="mt-4">
          <Card className="p-5 shadow-card">
            <h3 className="font-bold text-primary mb-3 flex items-center gap-2">
              <Scale className="h-4 w-4" /> {t("rep_trial_title")}
            </h3>
            {trial.length === 0 ? (
              <EmptyMsg label={t("rep_no_data")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                      <th className="text-start py-2 font-medium">{t("rep_account")}</th>
                      <th className="text-start py-2 font-medium">{t("rep_label")}</th>
                      <th className="text-center py-2 font-medium hidden sm:table-cell">{t("rep_class_short")}</th>
                      <th className="text-end py-2 font-medium">{t("jrn_debit")}</th>
                      <th className="text-end py-2 font-medium">{t("jrn_credit")}</th>
                      <th className="text-end py-2 font-medium">{t("rep_balance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trial.map((r) => (
                      <tr key={r.account} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                        <td className="py-2 font-mono text-xs font-bold text-primary">{r.account}</td>
                        <td className="py-2 text-xs">{r.label}</td>
                        <td className="py-2 text-center hidden sm:table-cell">
                          <Badge variant="secondary" className="text-[9px]">{r.class}</Badge>
                        </td>
                        <td className="py-2 text-end font-mono text-xs">{r.debit ? fmtDZD(r.debit) : "—"}</td>
                        <td className="py-2 text-end font-mono text-xs">{r.credit ? fmtDZD(r.credit) : "—"}</td>
                        <td className={`py-2 text-end font-mono text-xs font-bold ${r.balance >= 0 ? "text-primary" : "text-gold-deep"}`}>
                          {fmtDZD(Math.abs(r.balance))} {r.balance >= 0 ? "D" : "C"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-bold">
                      <td colSpan={3} className="py-2 text-end text-xs uppercase text-muted-foreground">{t("rep_totals")}</td>
                      <td className="py-2 text-end font-mono">{fmtDZD(totalDebit)}</td>
                      <td className="py-2 text-end font-mono">{fmtDZD(totalCredit)}</td>
                      <td className="py-2 text-end">
                        <Badge variant="outline" className={balanced ? "border-primary/40 text-primary bg-primary/5" : "border-destructive/40 text-destructive bg-destructive/5"}>
                          {balanced ? "✓" : fmtDZD(Math.abs(totalDebit - totalCredit))}
                        </Badge>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ===== Bilan ===== */}
        <TabsContent value="bilan" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-5 shadow-card">
              <h3 className="font-bold text-primary mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> {t("rep_bilan_actif")}
              </h3>
              <BilanCol rows={bilan.actif} side="actif" t={t} />
              <Total label={t("rep_total_actif")} value={bilan.totalActif} />
            </Card>
            <Card className="p-5 shadow-card">
              <h3 className="font-bold text-primary mb-3 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" /> {t("rep_bilan_passif")}
              </h3>
              <BilanCol rows={bilan.passif} side="passif" t={t} />
              <Total label={t("rep_total_passif")} value={bilan.totalPassif} />
            </Card>
          </div>
          <Card className="p-4 mt-3 shadow-card border-gold/40 bg-linear-to-br from-gold/10 to-card">
            <div className="flex items-center justify-between">
              <span className="font-bold text-primary">{t("rep_result_period")}</span>
              <span className={`text-2xl font-bold ${bilan.result >= 0 ? "text-gold-deep" : "text-destructive"}`}>
                {fmtDZD(bilan.result)}
              </span>
            </div>
          </Card>
        </TabsContent>

        {/* ===== TCR ===== */}
        <TabsContent value="tcr" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-5 shadow-card">
              <h3 className="font-bold text-primary mb-3">{t("rep_tcr_produits")}</h3>
              <TcrCol rows={tcr.produits} side="credit" />
              <Total label={t("rep_total_produits")} value={tcr.totalProduits} />
            </Card>
            <Card className="p-5 shadow-card">
              <h3 className="font-bold text-primary mb-3">{t("rep_tcr_charges")}</h3>
              <TcrCol rows={tcr.charges} side="debit" />
              <Total label={t("rep_total_charges")} value={tcr.totalCharges} />
            </Card>
          </div>
          <Card className="p-4 mt-3 shadow-card border-gold/40 bg-linear-to-br from-gold/10 to-card">
            <div className="flex items-center justify-between">
              <span className="font-bold text-primary">{t("rep_net_result")}</span>
              <span className={`text-2xl font-bold ${tcr.result >= 0 ? "text-gold-deep" : "text-destructive"}`}>
                {fmtDZD(tcr.result)}
              </span>
            </div>
          </Card>
        </TabsContent>

        {/* ===== G50 Live ===== */}
        <TabsContent value="g50" className="mt-4">
          <Card className="p-5 shadow-card">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <Receipt className="h-4 w-4" /> {t("rep_g50_live")} — {period}
              </h3>
              <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5 text-[10px]">
                {t("sync_from_modules")}
              </Badge>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              <KpiBox label={t("g50_live_ca")} value={fmtDZD(g50.caHt)} />
              <KpiBox label={t("g50_live_tva_collected")} value={fmtDZD(g50.tvaCollected)} />
              <KpiBox label={t("g50_live_tva_deductible")} value={fmtDZD(g50.tvaDeductible)} />
              <KpiBox label={t("g50_live_tva_due")} value={fmtDZD(g50.tvaDue)} highlight />
              <KpiBox label={t("g50_live_salaries")} value={fmtDZD(g50.salaries)} />
              <KpiBox label={t("g50_live_irg")} value={fmtDZD(g50.irgSalaries)} />
            </div>
            <div className="flex items-end gap-3 flex-wrap mb-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("tax_ibs_prior_year")}</Label>
                <Input type="number" min={0} value={ibsPrior} onChange={(e) => setIbsPrior(e.target.value)} onBlur={saveIbsPrior} className="w-44" />
              </div>
              {g50.precompteFromPrev > 0 && (
                <span className="text-xs text-muted-foreground pb-2">
                  {t("tax_g50_precompte_in")}: {fmtDZD(g50.precompteFromPrev)}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {g50.tapRate > 0 && <G50Row label={`TAP (${g50.tapRate}%)`} base={g50.caHt} value={g50.tap} />}
              <G50Row label={`TVA`} base={g50.tvaCollected - g50.tvaDeductible} value={g50.tvaDue} />
              <G50Row label={`IRG / Salaires`} base={g50.salaries} value={g50.irgSalaries} />
              {g50.ibs > 0 && <G50Row label={`IBS acompte (${g50.ibsRate}% IBS N-1)`} base={Math.round((g50.ibs * 100) / g50.ibsRate)} value={g50.ibs} />}
            </div>
            <div className="mt-4 p-4 rounded-lg bg-linear-to-br from-gold/15 to-gold/5 border border-gold/40 flex items-center justify-between">
              <span className="font-bold text-primary">{t("tools_g50_total")}</span>
              <span className="text-2xl font-bold text-gold-deep">{fmtDZD(g50.total)}</span>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const EmptyMsg = ({ label }: { label: string }) => (
  <div className="text-center py-8 text-sm text-muted-foreground">{label}</div>
);

const Total = ({ label, value }: { label: string; value: number }) => {
  const fmtDZD = useFmtDZD();
  return (
    <div className="border-t-2 border-border mt-2 pt-3 flex items-center justify-between font-bold">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="text-base text-primary font-mono">{fmtDZD(value)}</span>
    </div>
  );
};

const BilanCol = ({ rows, side, t }: { rows: any[]; side: "actif" | "passif"; t: (k: string) => string }) => {
  const fmtDZD = useFmtDZD();
  return (
  <div className="space-y-1">
    {rows.length === 0 ? <EmptyMsg label={t("rep_no_data")} /> : rows.map((r) => {
      const v = side === "actif" ? Math.max(0, r.balance) : Math.max(0, -r.balance);
      if (v === 0) return null;
      return (
        <div key={r.account} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-primary shrink-0">{r.account}</span>
            <span className="truncate text-muted-foreground">{r.label}</span>
          </div>
          <span className="font-mono font-semibold">{fmtDZD(v)}</span>
        </div>
      );
    })}
  </div>
  );
};

const TcrCol = ({ rows, side }: { rows: any[]; side: "debit" | "credit" }) => {
  const fmtDZD = useFmtDZD();
  return (
  <div className="space-y-1">
    {rows.length === 0 ? <EmptyMsg label="—" /> : rows.map((r) => {
      const v = side === "credit" ? r.credit - r.debit : r.debit - r.credit;
      if (v === 0) return null;
      return (
        <div key={r.account} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-primary shrink-0">{r.account}</span>
            <span className="truncate text-muted-foreground">{r.label}</span>
          </div>
          <span className="font-mono font-semibold">{fmtDZD(v)}</span>
        </div>
      );
    })}
  </div>
  );
};

const KpiBox = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <Card className={`p-3 shadow-card ${highlight ? "border-gold/40 bg-linear-to-br from-gold/10 to-card" : ""}`}>
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-base font-bold mt-0.5 ${highlight ? "text-gold-deep" : "text-foreground"} font-mono`}>{value}</div>
  </Card>
);

const G50Row = ({ label, base, value }: { label: string; base: number; value: number }) => {
  const fmtDZD = useFmtDZD();
  return (
  <div className="grid grid-cols-12 gap-2 items-center text-xs p-2 rounded border border-border/60 bg-card">
    <div className="col-span-5 font-semibold">{label}</div>
    <div className="col-span-4 text-end text-muted-foreground font-mono">Base: {fmtDZD(base)}</div>
    <div className="col-span-3 text-end font-bold text-gold-deep font-mono">{fmtDZD(value)}</div>
  </div>
);
};
