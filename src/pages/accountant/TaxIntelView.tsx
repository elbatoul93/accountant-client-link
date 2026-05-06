/**
 * Algerian Tax Intelligence — interactive panel.
 *
 * Tabs:
 *  1. IBS Acomptes (30% × N-1, sector rates 19/23/26)
 *  2. IRG Professions Libérales (progressive 2024 scale)
 *  3. TFP / TAPP (gross salary mass + workforce rule + formation deduction)
 *  4. TRWI (fixed annual fee PP/PM)
 *  5. G50 Preview — official-form layout aggregating the above
 */
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Calculator, Building2, Briefcase, Wallet, Tv, FileText, Landmark, Users,
  Receipt, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, FileSpreadsheet,
} from "lucide-react";
import {
  IBS_RATES, type IbsSector, computeIbs, computeIbsAcompte,
  IRG_PRO_BRACKETS_2024, computeIrgProfessionsLiberales,
  computeTfpTapp, TFP_TAPP_THRESHOLD,
  TRWI_FEES, type LegalEntityKind, computeTrwi,
  buildG50Preview, type G50Line, type G50Section,
  TAP_RATE, buildEtat104,
} from "@/lib/accounting/algerianTax";
import { computeG50FromJournal, type JournalLine } from "@/lib/accounting/engine";
import { type BillInvoice, type PrecompteMap, precompteKey } from "./SuiteModules";

const fmtDZD = (n: number) =>
  `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(Math.round(n))} DA`;

interface ClientLite { id: string; name: string; legalForm?: string }

interface Props {
  t: (k: string) => string;
  journal: JournalLine[];
  clients: ClientLite[];
  bills: BillInvoice[];
  precompte: PrecompteMap;
  setPrecompte: React.Dispatch<React.SetStateAction<PrecompteMap>>;
}

/** Compute the previous YYYY-MM string. */
const prevPeriod = (period: string): string => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Compute the next YYYY-MM string. */
const nextPeriod = (period: string): string => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const TaxIntelView = ({ t, journal, clients, bills, precompte, setPrecompte }: Props) => {
  const [clientId, setClientId] = useState<string>("ALL");
  const [period, setPeriod] = useState<string>(new Date().toISOString().slice(0, 7));

  /* IBS state */
  const [ibsSector, setIbsSector] = useState<IbsSector>("SERVICES");
  const [ibsPrior, setIbsPrior] = useState<string>("0");
  const [ibsResult, setIbsResult] = useState<string>("0");
  const ibsAcompte = computeIbsAcompte(Number(ibsPrior || 0));
  const ibsAnnual = computeIbs(Number(ibsResult || 0), ibsSector);
  const monthlyIbsShare = Math.round(ibsAcompte.perAcompte / 3);

  /* IRG state */
  const [irgTaxable, setIrgTaxable] = useState<string>("0");
  const irg = computeIrgProfessionsLiberales(Number(irgTaxable || 0));

  /* TFP / TAPP state */
  const [grossMass, setGrossMass] = useState<string>("0");
  const [empCount, setEmpCount] = useState<string>("0");
  const [formation, setFormation] = useState<string>("0");
  const tfpTapp = computeTfpTapp({
    grossMass: Number(grossMass || 0),
    employeeCount: Number(empCount || 0),
    formationExpenses: Number(formation || 0),
  });

  /* G50 — pulls live amounts from journal then layers our calculators on top.
   * TAP forced to 1% (LF 2024). Précompte is auto-loaded from previous month.
   * TRWI (Radio/TV) removed from G50 per regulatory update. */
  const cid = clientId === "ALL" ? undefined : clientId;
  const liveG50 = useMemo(
    () => computeG50FromJournal(journal, { clientId: cid, period, tapRate: TAP_RATE }),
    [journal, cid, period],
  );

  const precompteFromPrev = precompte[precompteKey(cid, prevPeriod(period))] ?? 0;

  const g50 = useMemo(
    () => buildG50Preview({
      period,
      caHt: liveG50.caHt,
      tvaCollected: liveG50.tvaCollected,
      tvaDeductible: liveG50.tvaDeductible,
      precompteFromPrev,
      tapRate: TAP_RATE,
      irgSalaries: liveG50.irgSalaries,
      ibsAcompte: monthlyIbsShare,
      tfpTapp,
    }),
    [period, liveG50, precompteFromPrev, monthlyIbsShare, tfpTapp],
  );

  /* Auto-persist the carry-forward Précompte for this period whenever it changes,
   * so next month's G50 picks it up automatically. */
  useEffect(() => {
    const k = precompteKey(cid, period);
    setPrecompte((p) => {
      if (g50.tva.precompteToNext > 0) {
        if (p[k] === g50.tva.precompteToNext) return p;
        return { ...p, [k]: g50.tva.precompteToNext };
      }
      if (k in p) {
        const { [k]: _, ...rest } = p;
        return rest;
      }
      return p;
    });
  }, [cid, period, g50.tva.precompteToNext, setPrecompte]);

  /* État 104 — supplier list (purchase invoices). */
  const filteredBills = useMemo(
    () => bills.filter((b) => (cid ? b.clientId === cid : true)),
    [bills, cid],
  );
  const etat104 = useMemo(
    () => buildEtat104(
      filteredBills.map((b) => ({
        number: b.number, date: b.date, party: b.party,
        partyTaxId: b.partyTaxId,
        ht: b.ht, tva: b.tva, ttc: b.ttc, kind: b.kind,
      })),
      { from: `${period}-01`, to: `${period}-31` },
    ),
    [filteredBills, period],
  );

  return (
    <div className="space-y-4">
      {/* Header / context selectors */}
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
          <div className="ms-auto">
            <Badge variant="outline" className="border-gold-deep/40 text-gold-deep bg-gold/5 gap-1">
              <Landmark className="h-3 w-3" /> LF 2024
            </Badge>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="g50">
        <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full max-w-4xl">
          <TabsTrigger value="ibs">{t("tax_tab_ibs")}</TabsTrigger>
          <TabsTrigger value="irg">{t("tax_tab_irg")}</TabsTrigger>
          <TabsTrigger value="tfp">{t("tax_tab_tfp")}</TabsTrigger>
          <TabsTrigger value="trwi">{t("tax_tab_trwi")}</TabsTrigger>
          <TabsTrigger value="etat104">{t("tax_tab_etat104")}</TabsTrigger>
          <TabsTrigger value="g50">{t("tax_tab_g50")}</TabsTrigger>
        </TabsList>

        {/* ===== IBS ===== */}
        <TabsContent value="ibs" className="mt-4">
          <Card className="p-5 shadow-card">
            <h3 className="font-bold text-primary mb-1 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gold-deep" /> {t("tax_ibs_title")}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">{t("tax_ibs_subtitle")}</p>

            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("tax_ibs_sector")}</Label>
                <Select value={ibsSector} onValueChange={(v) => setIbsSector(v as IbsSector)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRODUCTION">{t("tax_ibs_production")} — 19%</SelectItem>
                    <SelectItem value="BTPH">{t("tax_ibs_btph")} — 23%</SelectItem>
                    <SelectItem value="SERVICES">{t("tax_ibs_services")} — 26%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("tax_ibs_prior_year")}</Label>
                <Input type="number" value={ibsPrior} onChange={(e) => setIbsPrior(e.target.value)} placeholder="500000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("tax_ibs_taxable")}</Label>
                <Input type="number" value={ibsResult} onChange={(e) => setIbsResult(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <KpiBox label={t("tax_ibs_rate")} value={`${IBS_RATES[ibsSector]} %`} />
              <KpiBox label={t("tax_ibs_per_acompte")} value={fmtDZD(ibsAcompte.perAcompte)} highlight />
              <KpiBox label={t("tax_ibs_total_3")} value={fmtDZD(ibsAcompte.totalThreeAcomptes)} />
            </div>

            <div className="mt-4 p-4 rounded-lg bg-gradient-to-br from-primary/5 to-card border border-primary/20">
              <div className="text-xs uppercase text-muted-foreground tracking-wide">{t("tax_ibs_annual")}</div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-sm text-muted-foreground">{t("tax_ibs_taxable")} × {ibsAnnual.rate}%</span>
                <span className="text-2xl font-bold text-primary">{fmtDZD(ibsAnnual.ibs)}</span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground mt-3">{t("tax_ibs_hint")}</p>
          </Card>
        </TabsContent>

        {/* ===== IRG ===== */}
        <TabsContent value="irg" className="mt-4">
          <Card className="p-5 shadow-card">
            <h3 className="font-bold text-primary mb-1 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-gold-deep" /> {t("tax_irg_title")}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">{t("tax_irg_subtitle")}</p>

            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("tax_irg_taxable")}</Label>
                <Input type="number" value={irgTaxable} onChange={(e) => setIrgTaxable(e.target.value)} placeholder="1500000" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <KpiBox label={t("tax_irg_total")} value={fmtDZD(irg.total)} highlight />
                <KpiBox label={t("tax_irg_effective")} value={`${irg.effectiveRate} %`} />
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-muted-foreground bg-muted/50">
                    <th className="text-start py-2 px-3 font-medium">{t("tax_irg_bracket")}</th>
                    <th className="text-end py-2 px-3 font-medium">{t("tax_irg_rate")}</th>
                    <th className="text-end py-2 px-3 font-medium">{t("tax_irg_slice")}</th>
                    <th className="text-end py-2 px-3 font-medium">{t("tax_irg_amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {IRG_PRO_BRACKETS_2024.map((b, i) => {
                    const d = irg.detail.find((x) => x.bracket.upTo === b.upTo);
                    const active = !!d;
                    return (
                      <tr key={i} className={`border-t border-border/50 ${active ? "bg-gold/5" : ""}`}>
                        <td className="py-2 px-3 text-xs">{b.label}</td>
                        <td className="py-2 px-3 text-end font-mono text-xs">{b.rate} %</td>
                        <td className="py-2 px-3 text-end font-mono text-xs">{d ? fmtDZD(d.slice) : "—"}</td>
                        <td className={`py-2 px-3 text-end font-mono text-xs font-semibold ${active ? "text-gold-deep" : "text-muted-foreground"}`}>
                          {d ? fmtDZD(d.amount) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30 font-bold">
                    <td colSpan={3} className="py-2 px-3 text-end uppercase text-xs">{t("tax_irg_total")}</td>
                    <td className="py-2 px-3 text-end font-mono text-primary">{fmtDZD(irg.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ===== TFP / TAPP ===== */}
        <TabsContent value="tfp" className="mt-4">
          <Card className="p-5 shadow-card">
            <h3 className="font-bold text-primary mb-1 flex items-center gap-2">
              <Users className="h-4 w-4 text-gold-deep" /> {t("tax_tfp_title")}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">{t("tax_tfp_subtitle")}</p>

            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("tax_tfp_gross_mass")}</Label>
                <Input type="number" value={grossMass} onChange={(e) => setGrossMass(e.target.value)} placeholder="2500000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("tax_tfp_emp_count")}</Label>
                <Input type="number" value={empCount} onChange={(e) => setEmpCount(e.target.value)} placeholder="20" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("tax_tfp_formation")}</Label>
                <Input type="number" value={formation} onChange={(e) => setFormation(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className={`mb-4 p-3 rounded-md border text-xs ${tfpTapp.thresholdMet ? "border-primary/30 bg-primary/5 text-primary" : "border-gold/40 bg-gold/5 text-gold-deep"}`}>
              {tfpTapp.thresholdMet
                ? t("tax_tfp_threshold_met").replace("{n}", String(TFP_TAPP_THRESHOLD))
                : t("tax_tfp_threshold_not_met").replace("{n}", String(TFP_TAPP_THRESHOLD))}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiBox label={`TFP (${tfpTapp.tfpRate}%)`} value={fmtDZD(tfpTapp.tfpGross)} />
              <KpiBox label={t("tax_tfp_deduction")} value={`- ${fmtDZD(tfpTapp.tfpDeduction)}`} />
              <KpiBox label={t("tax_tfp_due")} value={fmtDZD(tfpTapp.tfpDue)} highlight />
              <KpiBox label={`TAPP (${tfpTapp.tappRate}%)`} value={fmtDZD(tfpTapp.tapp)} highlight />
            </div>

            <div className="mt-4 p-4 rounded-lg bg-gradient-to-br from-gold/15 to-gold/5 border border-gold/40 flex items-center justify-between">
              <span className="font-bold text-primary">{t("tax_tfp_total")}</span>
              <span className="text-2xl font-bold text-gold-deep">{fmtDZD(tfpTapp.total)}</span>
            </div>
          </Card>
        </TabsContent>

        {/* ===== TRWI ===== */}
        <TabsContent value="trwi" className="mt-4">
          <Card className="p-5 shadow-card">
            <h3 className="font-bold text-primary mb-1 flex items-center gap-2">
              <Tv className="h-4 w-4 text-gold-deep" /> {t("tax_trwi_title")}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">{t("tax_trwi_subtitle")}</p>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("tax_trwi_kind")}</Label>
                <Select value={trwiKind} onValueChange={(v) => setTrwiKind(v as LegalEntityKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PP">{t("tax_trwi_pp")} — {fmtDZD(TRWI_FEES.PP)}</SelectItem>
                    <SelectItem value="PM">{t("tax_trwi_pm")} — {fmtDZD(TRWI_FEES.PM)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="w-full p-4 rounded-lg bg-gradient-to-br from-gold/15 to-gold/5 border border-gold/40 flex items-center justify-between">
                  <span className="font-bold text-primary">{t("tax_trwi_annual")}</span>
                  <span className="text-2xl font-bold text-gold-deep">{fmtDZD(trwi)}</span>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ===== État 104 — Liste des Fournisseurs ===== */}
        <TabsContent value="etat104" className="mt-4">
          <Card className="p-5 shadow-card">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-primary flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-gold-deep" /> {t("tax_etat104_title")}
                </h3>
                <p className="text-xs text-muted-foreground">{t("tax_etat104_subtitle")}</p>
              </div>
              <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5 text-[10px]">
                {t("rep_period")}: {period}
              </Badge>
            </div>

            {etat104.rows.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-border rounded-lg text-sm text-muted-foreground">
                {t("tax_etat104_empty")}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-muted-foreground bg-muted/50">
                      <th className="text-start py-2 px-3 font-medium">{t("tax_etat104_supplier")}</th>
                      <th className="text-start py-2 px-3 font-medium">NIF</th>
                      <th className="text-start py-2 px-3 font-medium hidden md:table-cell">{t("tax_etat104_invoice")}</th>
                      <th className="text-start py-2 px-3 font-medium hidden lg:table-cell">{t("dash_date")}</th>
                      <th className="text-end py-2 px-3 font-medium">{t("bill_ht")}</th>
                      <th className="text-end py-2 px-3 font-medium hidden sm:table-cell">{t("bill_tva")}</th>
                      <th className="text-end py-2 px-3 font-medium">{t("bill_ttc")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {etat104.rows.flatMap((row, rIdx) => row.invoices.map((inv, iIdx) => (
                      <tr key={`${rIdx}-${iIdx}`} className="border-t border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-3 text-xs font-semibold">{iIdx === 0 ? row.supplier : ""}</td>
                        <td className="py-2 px-3 text-xs font-mono text-muted-foreground">{iIdx === 0 ? row.nif : ""}</td>
                        <td className="py-2 px-3 text-xs font-mono hidden md:table-cell">{inv.number}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground hidden lg:table-cell">{inv.date}</td>
                        <td className="py-2 px-3 text-end font-mono text-xs">{fmtDZD(inv.ht)}</td>
                        <td className="py-2 px-3 text-end font-mono text-xs hidden sm:table-cell">{fmtDZD(inv.tva)}</td>
                        <td className="py-2 px-3 text-end font-mono text-xs font-semibold text-gold-deep">{fmtDZD(inv.ttc)}</td>
                      </tr>
                    )))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30 font-bold">
                      <td colSpan={4} className="py-2 px-3 text-end uppercase text-xs">{t("tax_g50_total")}</td>
                      <td className="py-2 px-3 text-end font-mono text-xs">{fmtDZD(etat104.grandHt)}</td>
                      <td className="py-2 px-3 text-end font-mono text-xs hidden sm:table-cell">{fmtDZD(etat104.grandTva)}</td>
                      <td className="py-2 px-3 text-end font-mono text-primary">{fmtDZD(etat104.grandTtc)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground mt-3">{t("tax_etat104_hint")}</p>
          </Card>
        </TabsContent>

        {/* ===== G50 Official-style Preview — Sectioned Layout ===== */}
        <TabsContent value="g50" className="mt-4">
          <Card className="p-0 shadow-card overflow-hidden">
            {/* Official-form heading */}
            <div className="bg-gradient-to-r from-primary to-primary/90 text-primary-foreground p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-xs opacity-80 uppercase tracking-wider">République Algérienne Démocratique et Populaire</div>
                  <div className="text-xs opacity-80">Direction Générale des Impôts — DGI</div>
                  <h3 className="text-xl font-bold mt-2 flex items-center gap-2">
                    <FileText className="h-5 w-5" /> {t("tax_g50_official")} — Série G n° 50
                  </h3>
                </div>
                <div className="text-end">
                  <div className="text-[11px] opacity-80">{t("rep_period")}</div>
                  <div className="font-mono font-bold text-lg">{period}</div>
                  <div className="text-[11px] opacity-80 mt-1">
                    {clientId === "ALL"
                      ? t("rep_all_clients")
                      : (clients.find((c) => c.id === clientId)?.name ?? "—")}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Précompte alert */}
              {g50.tva.precompteFromPrev > 0 && (
                <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-primary flex items-center gap-2">
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  {t("tax_g50_precompte_in")}: <span className="font-mono font-bold">{fmtDZD(g50.tva.precompteFromPrev)}</span>
                  <span className="opacity-70">({prevPeriod(period)})</span>
                </div>
              )}
              {g50.tva.precompteToNext > 0 && (
                <div className="rounded-md border border-gold/50 bg-gold/10 px-3 py-2 text-xs text-gold-deep flex items-center gap-2">
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                  {t("tax_g50_precompte_out")}: <span className="font-mono font-bold">{fmtDZD(g50.tva.precompteToNext)}</span>
                  <span className="opacity-70">→ {nextPeriod(period)}</span>
                </div>
              )}

              <G50SectionCard section={g50.sections.A} icon={<Receipt className="h-4 w-4" />} />
              <G50SectionCard section={g50.sections.B} icon={<Calculator className="h-4 w-4" />} />
              <G50SectionCard section={g50.sections.C} icon={<Briefcase className="h-4 w-4" />} />
              <G50SectionCard section={g50.sections.D} icon={<Wallet className="h-4 w-4" />} />

              {/* Grand total */}
              <div className="rounded-lg bg-gradient-to-r from-gold/15 to-gold/5 border-2 border-gold/40 p-4 flex items-center justify-between">
                <span className="font-bold text-primary uppercase tracking-wide">{t("tax_g50_total")}</span>
                <span className="text-3xl font-bold text-gold-deep font-mono">{fmtDZD(g50.total)}</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-md border border-border bg-muted/30">
                  <div className="font-semibold text-primary mb-1 flex items-center gap-1.5">
                    <Calculator className="h-3.5 w-3.5" /> {t("tax_g50_sources")}
                  </div>
                  <ul className="text-muted-foreground space-y-1">
                    <li>• TVA / TAP / IRG: {t("sync_from_modules")}</li>
                    <li>• Précompte: {t("tax_g50_precompte_auto")}</li>
                    <li>• IBS Acompte: {t("tax_ibs_per_acompte")} ÷ 3</li>
                    <li>• TFP / TAPP: {t("tax_tfp_subtitle")}</li>
                    <li>• TRWI: {t("tax_trwi_annual")} ÷ 12</li>
                  </ul>
                </div>
                <div className="p-3 rounded-md border border-gold/40 bg-gold/5">
                  <div className="font-semibold text-gold-deep mb-1 flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" /> {t("tax_g50_due_date")}
                  </div>
                  <p className="text-muted-foreground">{t("tax_g50_due_hint")}</p>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const KpiBox = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <Card className={`p-3 shadow-card ${highlight ? "border-gold/40 bg-gradient-to-br from-gold/10 to-card" : ""}`}>
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-base font-bold mt-0.5 font-mono ${highlight ? "text-gold-deep" : "text-foreground"}`}>{value}</div>
  </Card>
);

const G50LineRow = ({ l }: { l: G50Line }) => {
  const fmt = (n?: number) =>
    n == null ? "—" : new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(Math.round(n));
  return (
    <tr className={`border-t border-border/50 hover:bg-muted/30 ${l.informational ? "text-muted-foreground" : ""}`}>
      <td className="py-2 px-3 font-mono text-xs font-bold text-primary">{l.code}</td>
      <td className="py-2 px-3 text-xs">{l.label}</td>
      <td className="py-2 px-3 text-end font-mono text-xs hidden md:table-cell">{fmt(l.base)}</td>
      <td className="py-2 px-3 text-end font-mono text-xs hidden sm:table-cell">{l.rate != null ? `${l.rate} %` : "—"}</td>
      <td className={`py-2 px-3 text-end font-mono text-xs font-bold ${l.informational ? "text-muted-foreground italic" : "text-gold-deep"}`}>
        {l.informational ? fmt(l.amount) : `${fmt(l.amount)} DA`}
      </td>
    </tr>
  );
};

const G50SectionCard = ({
  section, icon,
}: {
  section: { title: string; lines: G50Line[]; subtotal: number };
  icon: React.ReactNode;
}) => {
  if (section.lines.length === 0) return null;
  return (
    <Card className="p-0 overflow-hidden border-border/70">
      <div className="bg-muted/40 px-4 py-2 border-b border-border flex items-center justify-between">
        <div className="font-bold text-primary text-sm flex items-center gap-2">{icon}{section.title}</div>
        <Badge variant="outline" className="border-gold-deep/40 text-gold-deep bg-gold/5 font-mono text-xs">
          {new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(Math.round(section.subtotal))} DA
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {section.lines.map((l) => <G50LineRow key={l.code} l={l} />)}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
