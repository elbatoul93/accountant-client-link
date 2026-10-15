import { useMemo, useState } from "react";
import { useFmtDZD } from "@/lib/useFormat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, Printer, Scale, TrendingUp, Users, Lock as LockIcon } from "lucide-react";
import {
  type JournalLine, computeBilan, computeTCR, computeTrialBalance,
} from "@/lib/accounting/engine";
import type { Employee } from "./SuiteModules";
import { buildDAS } from "@/lib/accounting/payroll";


interface ClientLite {
  id: string; name: string;
  taxId?: string; nis?: string; rc?: string; bp?: string;
  taxRegime?: "REEL" | "SIMPLIFIE" | "IFU";
}

interface Props {
  t: (k: string) => string;
  journal: JournalLine[];
  employees: Employee[];
  clients: ClientLite[];
}

export const LiasseFiscaleView = ({ t, journal, employees, clients }: Props) => {
  const fmtDZD = useFmtDZD();
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "");
  const [year, setYear] = useState<number>(new Date().getFullYear() - 1);
  const client = clients.find((c) => c.id === clientId);

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const bilan = useMemo(() => computeBilan(journal, { clientId, to }), [journal, clientId, to]);
  const tcr = useMemo(() => computeTCR(journal, { clientId, from, to }), [journal, clientId, from, to]);
  const trial = useMemo(() => computeTrialBalance(journal, { clientId, from, to }), [journal, clientId, from, to]);
  const das = useMemo(
    () => buildDAS(employees.filter((e) => !e.clientId || e.clientId === clientId), year),
    [employees, clientId, year],
  );

  const dasTotals = das.reduce(
    (a, r) => ({
      gross: a.gross + r.grossAnnual,
      ss: a.ss + r.ssAnnual,
      irg: a.irg + r.irgAnnual,
      net: a.net + r.netAnnual,
    }),
    { gross: 0, ss: 0, irg: 0, net: 0 },
  );

  // Regime gate — IFU has no Liasse Fiscale
  const regime = client?.taxRegime;
  const ifuLocked = regime === "IFU";

  const printDoc = (id: string) => {
    const node = document.getElementById(id);
    if (!node) return;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${id}</title>
      <style>
        body { font-family:'Helvetica',Arial,sans-serif; padding:32px; color:#1f2937; }
        h1,h2 { color:#0f766e; }
        table { width:100%; border-collapse:collapse; margin-top:8px; font-size:12px; }
        th,td { padding:6px 8px; border-bottom:1px solid #e5e7eb; }
        th { background:#f0fdfa; color:#0f766e; text-align:left; font-size:10px; text-transform:uppercase; }
        .num { text-align:right; font-family:'Courier New',monospace; }
        .total { font-weight:700; background:linear-gradient(135deg,#fef3c7,#fde68a); }
        .head { display:flex; justify-content:space-between; border-bottom:2px solid #0f766e; padding-bottom:10px; margin-bottom:16px; }
        .meta { font-size:11px; color:#6b7280; }
      </style></head><body>${node.innerHTML}</body></html>`);
    w.document.close();
    // Print from the opener: no inline script in the popup (CSP-friendly).
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  if (clients.length === 0) {
    return (
      <Card className="p-8 text-center">
        <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">{t("liasse_pick_client")}</p>
      </Card>
    );
  }

  return (
    <Card className="p-5 shadow-card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <FileText className="h-4 w-4" /> {t("liasse_title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("liasse_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="space-y-1"><Label className="text-[10px] uppercase">{t("liasse_client")}</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-[10px] uppercase">{t("liasse_year")}</Label>
            <Input className="h-8 w-[100px] text-xs" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
        </div>
      </div>

      {ifuLocked ? (
        <div className="rounded-lg border-2 border-dashed border-warning/40 bg-warning/5 p-8 text-center">
          <LockIcon className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold text-primary">{t("liasse_ifu_locked_title")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("liasse_ifu_locked_msg")}</p>
        </div>
      ) : (
      <Tabs defaultValue="bilan">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
          <TabsTrigger value="bilan" className="gap-1.5"><Scale className="h-3.5 w-3.5" />{t("liasse_tab_bilan")}</TabsTrigger>
          <TabsTrigger value="tcr" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" />{t("liasse_tab_tcr")}</TabsTrigger>
          <TabsTrigger value="trial" className="gap-1.5"><FileText className="h-3.5 w-3.5" />{t("liasse_tab_trial")}</TabsTrigger>
          <TabsTrigger value="das301" className="gap-1.5"><Users className="h-3.5 w-3.5" />{t("liasse_tab_301bis")}</TabsTrigger>
        </TabsList>

        {/* ===== BILAN ===== */}
        <TabsContent value="bilan" className="mt-4">
          <div className="flex justify-end mb-2">
            <Button variant="gold" size="sm" onClick={() => printDoc("liasse-bilan")}>
              <Printer className="h-3.5 w-3.5" /> {t("liasse_print")}
            </Button>
          </div>
          <div id="liasse-bilan">
            <FiscalHeader t={t} client={client} year={year} title={t("liasse_doc_bilan")} />
            <div className="grid md:grid-cols-2 gap-4">
              <FiscalTable t={t} title={t("liasse_assets")} rows={bilan.actif} side="debit" total={bilan.totalActif} />
              <FiscalTable t={t} title={t("liasse_liabilities")} rows={bilan.passif} side="credit" total={bilan.totalPassif} />
            </div>
            <div className="mt-3 p-3 rounded-lg bg-gradient-to-br from-gold/15 to-gold/5 border border-gold/40 flex justify-between text-sm">
              <span className="font-semibold">{t("liasse_period_result")}</span>
              <span className={`font-bold font-mono ${bilan.result >= 0 ? "text-success" : "text-destructive"}`}>
                {bilan.result >= 0 ? "+" : ""}{fmtDZD(bilan.result)}
              </span>
            </div>
          </div>
        </TabsContent>

        {/* ===== TCR ===== */}
        <TabsContent value="tcr" className="mt-4">
          <div className="flex justify-end mb-2">
            <Button variant="gold" size="sm" onClick={() => printDoc("liasse-tcr")}>
              <Printer className="h-3.5 w-3.5" /> {t("liasse_print")}
            </Button>
          </div>
          <div id="liasse-tcr">
            <FiscalHeader t={t} client={client} year={year} title={t("liasse_doc_tcr")} />
            <div className="grid md:grid-cols-2 gap-4">
              <FiscalTable t={t} title={t("liasse_income_class7")} rows={tcr.produits} side="credit" total={tcr.totalProduits} />
              <FiscalTable t={t} title={t("liasse_expenses_class6")} rows={tcr.charges} side="debit" total={tcr.totalCharges} />
            </div>
            <div className="mt-3 grid sm:grid-cols-3 gap-2">
              <SmallStat label={t("liasse_total_produits")} value={fmtDZD(tcr.totalProduits)} tone="success" />
              <SmallStat label={t("liasse_total_charges")} value={fmtDZD(tcr.totalCharges)} tone="muted" />
              <SmallStat label={t("liasse_result")} value={`${tcr.result >= 0 ? "+" : ""}${fmtDZD(tcr.result)}`} tone={tcr.result >= 0 ? "gold" : "danger"} />
            </div>
          </div>
        </TabsContent>

        {/* ===== TRIAL ===== */}
        <TabsContent value="trial" className="mt-4">
          <div className="flex justify-end mb-2">
            <Button variant="gold" size="sm" onClick={() => printDoc("liasse-trial")}>
              <Printer className="h-3.5 w-3.5" /> {t("liasse_print")}
            </Button>
          </div>
          <div id="liasse-trial">
            <FiscalHeader t={t} client={client} year={year} title={t("liasse_doc_trial")} />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                  <th className="text-start font-medium py-2.5">{t("eng_pcn_account")}</th>
                  <th className="text-start font-medium py-2.5 hidden md:table-cell">{t("rep_label")}</th>
                  <th className="num text-end font-medium py-2.5">{t("jrn_debit")}</th>
                  <th className="num text-end font-medium py-2.5">{t("jrn_credit")}</th>
                  <th className="num text-end font-medium py-2.5">{t("jrn_balance")}</th>
                </tr>
              </thead>
              <tbody>
                {trial.map((r) => (
                  <tr key={r.account} className="border-b border-border/40">
                    <td className="py-2 font-mono text-xs font-semibold">{r.account}</td>
                    <td className="py-2 text-xs hidden md:table-cell">{r.label}</td>
                    <td className="num py-2 text-xs font-mono">{fmtDZD(r.debit)}</td>
                    <td className="num py-2 text-xs font-mono">{fmtDZD(r.credit)}</td>
                    <td className={`num py-2 text-xs font-mono font-semibold ${r.balance >= 0 ? "text-primary" : "text-gold-deep"}`}>{fmtDZD(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ===== 301 bis ===== */}
        <TabsContent value="das301" className="mt-4">
          <div className="flex justify-end mb-2">
            <Button variant="gold" size="sm" onClick={() => printDoc("liasse-301bis")}>
              <Printer className="h-3.5 w-3.5" /> {t("liasse_print")}
            </Button>
          </div>
          <div id="liasse-301bis">
            <FiscalHeader t={t} client={client} year={year} title={`${t("liasse_etat_301bis")} — ${t("liasse_301_subtitle")}`} />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                  <th className="text-start font-medium py-2.5">{t("liasse_col_matricule")}</th>
                  <th className="text-start font-medium py-2.5">{t("liasse_col_name")}</th>
                  <th className="num text-end font-medium py-2.5">{t("liasse_col_months")}</th>
                  <th className="num text-end font-medium py-2.5">{t("liasse_col_gross_year")}</th>
                  <th className="num text-end font-medium py-2.5">{t("liasse_col_ss")}</th>
                  <th className="num text-end font-medium py-2.5">{t("liasse_col_irg")}</th>
                  <th className="num text-end font-medium py-2.5">{t("liasse_col_net")}</th>
                </tr>
              </thead>
              <tbody>
                {das.map((r) => (
                  <tr key={r.employeeId} className="border-b border-border/40">
                    <td className="py-2 font-mono text-xs">{r.nss || "—"}</td>
                    <td className="py-2 text-xs font-semibold">{r.name}</td>
                    <td className="num py-2 text-xs font-mono">{r.monthsWorked}</td>
                    <td className="num py-2 text-xs font-mono">{fmtDZD(r.grossAnnual)}</td>
                    <td className="num py-2 text-xs font-mono text-muted-foreground">{fmtDZD(r.ssAnnual)}</td>
                    <td className="num py-2 text-xs font-mono text-muted-foreground">{fmtDZD(r.irgAnnual)}</td>
                    <td className="num py-2 text-xs font-mono font-bold text-gold-deep">{fmtDZD(r.netAnnual)}</td>
                  </tr>
                ))}
                <tr className="total bg-muted/40 font-semibold">
                  <td colSpan={3} className="py-2 text-xs uppercase">{t("rep_totals")}</td>
                  <td className="num py-2 text-xs font-mono">{fmtDZD(dasTotals.gross)}</td>
                  <td className="num py-2 text-xs font-mono">{fmtDZD(dasTotals.ss)}</td>
                  <td className="num py-2 text-xs font-mono">{fmtDZD(dasTotals.irg)}</td>
                  <td className="num py-2 text-xs font-mono">{fmtDZD(dasTotals.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
      )}
    </Card>
  );
};

const FiscalHeader = ({ t, client, year, title }: { t: (k: string) => string; client?: ClientLite; year: number; title: string }) => (
  <div className="head mb-4 pb-3 border-b-2 border-primary">
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">République Algérienne — DGI</p>
      <h2 className="text-lg font-bold text-primary">{title}</h2>
      <p className="text-xs text-muted-foreground">Exercice {year}</p>
    </div>
    {client && (
      <div className="text-xs text-end space-y-0.5 meta">
        <div className="font-bold text-primary text-sm">{client.name}</div>
        {client.taxId && <div>NIF: <span className="font-mono">{client.taxId}</span></div>}
        {client.nis && <div>NIS: <span className="font-mono">{client.nis}</span></div>}
        {client.rc && <div>RC: <span className="font-mono">{client.rc}</span></div>}
      </div>
    )}
  </div>
);

const FiscalTable = ({ t, title, rows, side, total }: {
  t: (k: string) => string; title: string; rows: any[]; side: "debit" | "credit"; total: number;
}) => {
  const fmtDZD = useFmtDZD();
  return (
  <div className="border border-border rounded-lg overflow-hidden">
    <div className="px-3 py-2 bg-primary/5 border-b border-border">
      <h3 className="text-xs font-bold text-primary uppercase tracking-wider">{title}</h3>
    </div>
    <table className="w-full text-sm">
      <tbody>
        {rows.length === 0 ? (
          <tr><td className="py-3 text-center text-xs text-muted-foreground">—</td></tr>
        ) : rows.map((r, i) => (
          <tr key={i} className="border-b border-border/40 last:border-0">
            <td className="py-2 px-3 text-xs">
              <span className="font-mono font-semibold text-primary me-2">{r.account}</span>
              <span className="text-muted-foreground">{r.label}</span>
            </td>
            <td className="num py-2 px-3 text-xs font-mono">{fmtDZD(Math.abs(side === "debit" ? Math.max(0, r.balance) : Math.max(0, -r.balance)) || (r[side] - r[side === "debit" ? "credit" : "debit"]))}</td>
          </tr>
        ))}
        <tr className="total bg-gradient-to-br from-gold/15 to-gold/5 border-t border-gold/40">
          <td className="py-2 px-3 text-xs font-bold uppercase">{t("liasse_total")}</td>
          <td className="num py-2 px-3 text-xs font-mono font-bold text-gold-deep">{fmtDZD(total)}</td>
        </tr>
      </tbody>
    </table>
  </div>
);
};

const SmallStat = ({ label, value, tone }: { label: string; value: string; tone: "success" | "muted" | "gold" | "danger" }) => {
  const cls = {
    success: "text-success border-success/30 bg-success/5",
    muted:   "text-muted-foreground border-border bg-muted/30",
    gold:    "text-gold-deep border-gold/40 bg-gold/5",
    danger:  "text-destructive border-destructive/30 bg-destructive/5",
  }[tone];
  return (
    <div className={`p-2.5 rounded-lg border ${cls}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="font-mono font-bold text-base">{value}</p>
    </div>
  );
};
