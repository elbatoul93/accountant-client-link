import { useEffect, useMemo, useState } from "react";
import { useFmtDZD, useFmtNum, useEmployerRate } from "@/lib/useFormat";
import { formatDate } from "@/lib/format";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Inbox, Users, FileText, FileDown, Printer, Calculator,
  UserPlus, UserMinus, Building2, Receipt, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  computePayslip, computePayrollMass, buildCnasAvis, buildMovements, buildDAS, buildDASFromPayslips,
  downloadCSV, type PayrollEmployee,
} from "@/lib/accounting/payroll";
import { postPayrollRun, type JournalLine, type PeriodLock } from "@/lib/accounting/engine";
import { recordPayslip, loadPayslips } from "@/features/accountant/lib/payrollStore";
import type { Employee } from "./SuiteModules";


type ClientLite = { id: string; name: string; hasCacobatph?: boolean };

const Empty = ({ label }: { label: string }) => (
  <div className="text-center py-10 border border-dashed border-border rounded-lg">
    <div className="inline-flex p-3 rounded-full bg-muted text-muted-foreground mb-3">
      <Inbox className="h-6 w-6" />
    </div>
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
);

export const PayrollAdvanced = ({
  t, employees, setEmployees, clients, setJournal, locks,
}: {
  t: (k: string) => string;
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  clients: ClientLite[];
  setJournal: React.Dispatch<React.SetStateAction<JournalLine[]>>;
  locks: PeriodLock[];
}) => {
  const employerRate = useEmployerRate();
  const fmtDZD = useFmtDZD();
  const [open, setOpen] = useState(false);
  const [slip, setSlip] = useState<Employee | null>(null);
  const [tab, setTab] = useState("employees");

  // Period selectors for CNAS / DAS
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState(today.slice(0, 7));    // YYYY-MM
  const [year, setYear] = useState(new Date().getFullYear());
  const [frequency, setFrequency] = useState<"monthly" | "quarterly">("monthly");

  const list = employees as PayrollEmployee[];
  const mass = useMemo(() => computePayrollMass(list), [list]);

  // DAS: use payslips really paid (saved payroll runs); fall back to a projection.
  const [paid, setPaid] = useState<Awaited<ReturnType<typeof loadPayslips>>>([]);
  useEffect(() => {
    let live = true;
    void loadPayslips(year).then((r) => { if (live) setPaid(r); });
    return () => { live = false; };
  }, [year]);
  const dasReal = paid.length > 0;
  const dasRows = useMemo(
    () => (dasReal ? buildDASFromPayslips(paid, year) : buildDAS(list, year)),
    [dasReal, paid, list, year],
  );

  const runPayroll = (e: Employee) => {
    const p = computePayslip(e as PayrollEmployee);
    const period = today.slice(0, 7);
    if (locks.some((l) => l.period === period && l.clientId === e.clientId)) {
      toast.error(t("eng_period_locked_payroll"));
      return;
    }
    const client = clients.find((c) => c.id === e.clientId);
    const lines = postPayrollRun({
      date: today, clientId: e.clientId, sourceRef: `${e.id}-${period}`,
      employeeId: e.id, employeeName: e.name,
      gross: p.gross, ssEmployee: p.ssEmployee, irg: p.irg, net: p.net,
      hasCacobatph: client?.hasCacobatph,
    });
    setJournal((p) => [...lines, ...p]);
    void recordPayslip(e as PayrollEmployee, e.clientId, period, lines[0]?.batchId);
    toast.success(`${t("eng_payroll_posted")} — ${e.name}`);
    setSlip(e);
  };

  return (
    <Card className="p-5 shadow-card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <Users className="h-4 w-4" /> {t("pay_title")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("pay_subtitle")} • {t("payx_engine")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {t("payx_employer_cost")}: {fmtDZD(mass.employerCost)}
          </Badge>
          <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {t("pay_add_employee")}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full">
          <TabsTrigger value="employees" className="gap-1.5"><Users className="h-3.5 w-3.5" />{t("payx_tab_employees")}</TabsTrigger>
          <TabsTrigger value="cnas" className="gap-1.5"><Receipt className="h-3.5 w-3.5" />{t("payx_tab_cnas")}</TabsTrigger>
          <TabsTrigger value="movements" className="gap-1.5"><UserPlus className="h-3.5 w-3.5" />{t("payx_tab_movements")}</TabsTrigger>
          <TabsTrigger value="das" className="gap-1.5"><FileText className="h-3.5 w-3.5" />{t("payx_tab_das")}</TabsTrigger>
          <TabsTrigger value="employer" className="gap-1.5"><Building2 className="h-3.5 w-3.5" />{t("payx_tab_employer")}</TabsTrigger>
        </TabsList>

        {/* ====== EMPLOYEES + CALCULATOR ====== */}
        <TabsContent value="employees" className="mt-4">
          {employees.length === 0 ? (
            <Empty label={t("pay_no_employees")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                    <th className="text-start font-medium py-2.5">{t("pay_employee")}</th>
                    <th className="text-end font-medium py-2.5">{t("pay_basic")}</th>
                    <th className="text-end font-medium py-2.5 hidden md:table-cell">{t("pay_gross")}</th>
                    <th className="text-end font-medium py-2.5 hidden md:table-cell">{t("payx_ss_emp")} 9%</th>
                    <th className="text-end font-medium py-2.5 hidden lg:table-cell">{t("payx_taxable")}</th>
                    <th className="text-end font-medium py-2.5 hidden md:table-cell">{t("pay_irg")}</th>
                    <th className="text-end font-medium py-2.5">{t("pay_net")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => {
                    const p = computePayslip(e as PayrollEmployee);
                    return (
                      <tr key={e.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                        <td className="py-3">
                          <div className="font-semibold">{e.name}</div>
                          <div className="text-xs text-muted-foreground">{e.position || "—"} {e.nss && `• ${e.nss}`}</div>
                        </td>
                        <td className="py-3 text-end font-mono text-xs">{fmtDZD(p.basic)}</td>
                        <td className="py-3 text-end font-mono text-xs hidden md:table-cell">{fmtDZD(p.gross)}</td>
                        <td className="py-3 text-end font-mono text-xs text-muted-foreground hidden md:table-cell">- {fmtDZD(p.ssEmployee)}</td>
                        <td className="py-3 text-end font-mono text-xs hidden lg:table-cell">{fmtDZD(p.taxable)}</td>
                        <td className="py-3 text-end font-mono text-xs text-muted-foreground hidden md:table-cell">- {fmtDZD(p.irg)}</td>
                        <td className="py-3 text-end font-bold text-gold-deep">{fmtDZD(p.net)}</td>
                        <td className="py-3 text-end">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setSlip(e)}>
                              <Printer className="h-3.5 w-3.5" /> {t("payx_payslip_pdf")}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={() => runPayroll(e)}>
                              <FileDown className="h-3.5 w-3.5" /> {t("pay_run_post")}
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => setEmployees((prev) => prev.filter((x) => x.id !== e.id))}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ====== CNAS ====== */}
        <TabsContent value="cnas" className="mt-4 space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("payx_period")}</Label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("payx_frequency")}</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t("payx_monthly")}</SelectItem>
                  <SelectItem value="quarterly">{t("payx_quarterly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="gold" className="w-full" onClick={() => {
                const a = buildCnasAvis(list, period, frequency);
                downloadCSV(`cnas_avis_${a.period}.csv`, [{
                  Periode: a.period, Frequence: a.frequency, Employes: a.employees,
                  Masse_Brute: a.grossMass, Part_Salariale_9: a.partSalariale,
                  Part_Patronale_26: a.partPatronale, Total_35: a.total,
                }]);
                toast.success(t("payx_cnas_exported"));
              }}>
                <FileDown className="h-4 w-4" /> {t("payx_export_csv")}
              </Button>
            </div>
          </div>

          {(() => {
            const a = buildCnasAvis(list, period, frequency);
            return (
              <Card className="p-5 border-2 border-primary/20 bg-linear-to-br from-primary/5 to-transparent">
                <div className="text-center mb-4 pb-3 border-b">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("payx_cnas_republic")}</p>
                  <h3 className="text-lg font-bold text-primary">{t("payx_cnas_avis")}</h3>
                  <p className="text-xs text-muted-foreground">{a.period} — {a.frequency === "monthly" ? t("payx_monthly") : t("payx_quarterly")}</p>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    <Row label={t("payx_employees_count")} value={String(a.employees)} />
                    <Row label={t("payx_gross_mass")} value={fmtDZD(a.grossMass)} />
                    <Row label={`${t("payx_ss_emp")} (9%)`} value={fmtDZD(a.partSalariale)} muted />
                    <Row label={`${t("payx_ss_employer")} (${employerRate}%)`} value={fmtDZD(a.partPatronale)} muted />
                  </tbody>
                </table>
                <div className="mt-3 p-3 rounded-lg bg-linear-to-br from-gold/15 to-gold/5 border border-gold/40 flex justify-between">
                  <span className="font-semibold text-primary">{t("payx_cnas_total")} (35%)</span>
                  <span className="text-xl font-bold text-gold-deep font-mono">{fmtDZD(a.total)}</span>
                </div>
              </Card>
            );
          })()}
        </TabsContent>

        {/* ====== MOVEMENTS ====== */}
        <TabsContent value="movements" className="mt-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("payx_period")}</Label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button variant="gold" className="w-full" onClick={() => {
                const m = buildMovements(list, period);
                const rows = [
                  ...m.hires.map((e) => ({ Type: "Embauche", Nom: e.name, NSS: e.nss || "", Date: e.hireDate || "", Salaire: e.basic })),
                  ...m.departures.map((e) => ({ Type: "Départ", Nom: e.name, NSS: e.nss || "", Date: e.endDate || "", Salaire: e.basic })),
                ];
                if (!rows.length) { toast.info(t("payx_no_movements")); return; }
                downloadCSV(`mouvements_${period}.csv`, rows);
                toast.success(t("payx_movements_exported"));
              }}>
                <FileDown className="h-4 w-4" /> {t("payx_export_csv")}
              </Button>
            </div>
          </div>

          {(() => {
            const m = buildMovements(list, period);
            return (
              <div className="grid md:grid-cols-2 gap-4">
                <MovementBox icon={UserPlus} title={t("payx_hires")} items={m.hires} dateField="hireDate" />
                <MovementBox icon={UserMinus} title={t("payx_departures")} items={m.departures} dateField="endDate" />
              </div>
            );
          })()}
        </TabsContent>

        {/* ====== DAS ====== */}
        <TabsContent value="das" className="mt-4 space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("payx_year")}</Label>
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            </div>
            <div className="sm:col-span-2 flex items-end">
              <Button variant="gold" className="w-full" onClick={() => {
                const rows = dasRows;
                if (!rows.length) { toast.info(t("payx_no_employees")); return; }
                downloadCSV(`DAS_${year}.csv`, rows.map((r) => ({
                  Matricule: r.nss || "", Nom: r.name, Poste: r.position || "",
                  Mois: r.monthsWorked, Brut_Annuel: r.grossAnnual, SS_Annuelle: r.ssAnnual,
                  Imposable_Annuel: r.taxableAnnual, IRG_Annuel: r.irgAnnual, Net_Annuel: r.netAnnual,
                })));
                toast.success(t("payx_das_exported"));
              }}>
                <FileDown className="h-4 w-4" /> {t("payx_das_export")}
              </Button>
            </div>
          </div>

          <Badge variant="outline" className="text-xs">{t(dasReal ? "payx_das_real" : "payx_das_estimate")}</Badge>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                  <th className="text-start font-medium py-2.5">{t("pay_employee")}</th>
                  <th className="text-end font-medium py-2.5">{t("payx_months")}</th>
                  <th className="text-end font-medium py-2.5">{t("payx_gross_year")}</th>
                  <th className="text-end font-medium py-2.5 hidden md:table-cell">{t("payx_ss_year")}</th>
                  <th className="text-end font-medium py-2.5">{t("payx_irg_year")}</th>
                  <th className="text-end font-medium py-2.5">{t("payx_net_year")}</th>
                </tr>
              </thead>
              <tbody>
                {dasRows.map((r) => (
                  <tr key={r.employeeId} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5">
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.nss || "—"}</div>
                    </td>
                    <td className="py-2.5 text-end font-mono text-xs">{r.monthsWorked}</td>
                    <td className="py-2.5 text-end font-mono text-xs">{fmtDZD(r.grossAnnual)}</td>
                    <td className="py-2.5 text-end font-mono text-xs hidden md:table-cell text-muted-foreground">{fmtDZD(r.ssAnnual)}</td>
                    <td className="py-2.5 text-end font-mono text-xs text-muted-foreground">{fmtDZD(r.irgAnnual)}</td>
                    <td className="py-2.5 text-end font-bold text-gold-deep font-mono">{fmtDZD(r.netAnnual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ====== EMPLOYER CONTRIBUTIONS OVERVIEW ====== */}
        <TabsContent value="employer" className="mt-4">
          <Card className="p-5 bg-linear-to-br from-primary/5 to-transparent">
            <h3 className="text-base font-bold text-primary mb-3 flex items-center gap-2">
              <Wallet className="h-4 w-4" /> {t("payx_employer_overview")}
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Stat label={t("payx_employees_count")} value={String(mass.employees)} />
              <Stat label={t("payx_gross_mass")} value={fmtDZD(mass.grossMass)} />
              <Stat label={`${t("payx_ss_employer")} (${employerRate}%)`} value={fmtDZD(mass.ssEmployerMass)} accent />
              <Stat label={`${t("payx_ss_emp")} (9%)`} value={fmtDZD(mass.ssEmployeeMass)} muted />
              <Stat label={t("payx_irg_total")} value={fmtDZD(mass.irgMass)} muted />
              <Stat label={t("payx_net_mass")} value={fmtDZD(mass.netMass)} />
            </div>
            <div className="mt-4 p-4 rounded-lg bg-linear-to-br from-gold/15 to-gold/5 border border-gold/40 flex justify-between items-center">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("payx_employer_cost")}</p>
                <p className="text-xs text-muted-foreground">{t("payx_employer_cost_hint")}</p>
              </div>
              <span className="text-2xl font-bold text-gold-deep font-mono">{fmtDZD(mass.employerCost)}</span>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <AddEmployeeDialog open={open} onOpenChange={setOpen} clients={clients} t={t}
        onAdd={(emp) => { setEmployees((p) => [emp, ...p]); setOpen(false); }} />

      <PayslipPdfDialog employee={slip} onClose={() => setSlip(null)} t={t} />
    </Card>
  );
};

/* ===== Sub-components ===== */

const Row = ({ label, value, muted }: { label: string; value: string; muted?: boolean }) => (
  <tr className="border-b border-border/40 last:border-0">
    <td className="py-2 text-sm">{label}</td>
    <td className={`py-2 text-end font-mono text-sm ${muted ? "text-muted-foreground" : "font-semibold"}`}>{value}</td>
  </tr>
);

const Stat = ({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) => (
  <div className={`p-3 rounded-lg border ${accent ? "border-gold/40 bg-gold/5" : "border-border bg-card"}`}>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`text-lg font-bold font-mono ${accent ? "text-gold-deep" : muted ? "text-muted-foreground" : "text-primary"}`}>{value}</p>
  </div>
);

const MovementBox = ({ icon: Icon, title, items, dateField }: {
  icon: any; title: string; items: PayrollEmployee[]; dateField: "hireDate" | "endDate";
}) => (
  <Card className="p-4">
    <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><Icon className="h-4 w-4 text-gold-deep" /> {title} ({items.length})</h4>
    {items.length === 0 ? (
      <p className="text-xs text-muted-foreground py-4 text-center">—</p>
    ) : (
      <ul className="space-y-2">
        {items.map((e) => (
          <li key={e.id} className="flex justify-between text-sm border-b border-border/40 pb-2 last:border-0">
            <div>
              <div className="font-semibold">{e.name}</div>
              <div className="text-xs text-muted-foreground">{e.position || "—"} • {e.nss || "—"}</div>
            </div>
            <div className="text-end text-xs text-muted-foreground font-mono">{e[dateField]}</div>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

/* ===== Add Employee Dialog (extended) ===== */

const AddEmployeeDialog = ({
  open, onOpenChange, clients, onAdd, t,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; clients: ClientLite[];
  onAdd: (e: Employee) => void; t: (k: string) => string;
}) => {
  const employerRate = useEmployerRate();
  const fmtDZD = useFmtDZD();
  const [name, setName] = useState("");
  const [nss, setNss] = useState("");
  const [position, setPosition] = useState("");
  const [clientId, setClientId] = useState<string>("none");
  const [basic, setBasic] = useState("");
  const [iew, setIew] = useState("");
  const [prc, setPrc] = useState("");
  const [other, setOther] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dependents, setDependents] = useState("");

  const reset = () => {
    setName(""); setNss(""); setPosition(""); setClientId("none");
    setBasic(""); setIew(""); setPrc(""); setOther("");
    setHireDate(""); setEndDate(""); setDependents("");
  };

  const submit = () => {
    if (!name.trim() || !basic) { toast.error(`${t("pay_employee")} & ${t("pay_basic")}`); return; }
    onAdd({
      id: crypto.randomUUID(),
      clientId: clientId === "none" ? undefined : clientId,
      name: name.trim(),
      nss: nss.trim() || undefined,
      position: position.trim() || undefined,
      basic: Number(basic), iew: Number(iew || 0), prc: Number(prc || 0),
      other: Number(other || 0),
      hireDate: hireDate || undefined,
      endDate: endDate || undefined,
      dependents: dependents ? Number(dependents) : undefined,
    });
    toast.success(t("payx_employee_added"));
    reset();
  };

  // live preview
  const preview = computePayslip({
    id: "", name: "", basic: Number(basic || 0), iew: Number(iew || 0),
    prc: Number(prc || 0), other: Number(other || 0),
  } as PayrollEmployee);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-gold-deep" /> {t("pay_add_employee")}</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${t("pay_employee")} *`} value={name} onChange={setName} placeholder={t("ph_employee_name")} />
              <Field label={t("payx_nss")} value={nss} onChange={setNss} placeholder="123456789012" />
            </div>
            <Field label={t("pay_position")} value={position} onChange={setPosition} placeholder={t("ph_employee_position")} />
            {clients.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("payx_client_optional")}</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("ph_cabinet_dash")}</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("payx_hire_date")} type="date" value={hireDate} onChange={setHireDate} />
              <Field label={t("payx_end_date")} type="date" value={endDate} onChange={setEndDate} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${t("pay_basic")} *`} type="number" value={basic} onChange={setBasic} placeholder="40000" />
              <Field label={t("pay_iew")} type="number" value={iew} onChange={setIew} placeholder="3000" />
              <Field label={t("pay_prc")} type="number" value={prc} onChange={setPrc} placeholder="5000" />
              <Field label={t("payx_other_indemnities")} type="number" value={other} onChange={setOther} placeholder="0" />
            </div>
          </div>

          {/* Live calculator preview */}
          <Card className="p-4 bg-muted/30 self-start">
            <h4 className="text-sm font-bold text-primary flex items-center gap-2 mb-3">
              <Calculator className="h-4 w-4 text-gold-deep" /> {t("payx_live_calc")}
            </h4>
            <div className="space-y-1.5 text-sm">
              <Line label={t("pay_gross")} value={fmtDZD(preview.gross)} bold />
              <Line label={`${t("payx_ss_emp")} (9%)`} value={`- ${fmtDZD(preview.ssEmployee)}`} muted />
              <Line label={t("payx_taxable")} value={fmtDZD(preview.taxable)} />
              <Line label={t("pay_irg")} value={`- ${fmtDZD(preview.irg)}`} muted />
              <div className="flex justify-between p-2 rounded-md bg-linear-to-br from-gold/15 to-gold/5 border border-gold/40 mt-2">
                <span className="font-semibold text-primary text-sm">{t("pay_net")}</span>
                <span className="text-base font-bold text-gold-deep font-mono">{fmtDZD(preview.net)}</span>
              </div>
              <Line label={`${t("payx_ss_employer")} (${employerRate}%)`} value={fmtDZD(preview.ssEmployer)} muted />
              <Line label={t("payx_employer_cost")} value={fmtDZD(preview.employerCost)} bold />
            </div>
          </Card>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{t("acc_save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  </div>
);

const Line = ({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) => (
  <div className={`flex justify-between text-sm ${bold ? "font-bold" : ""} ${muted ? "text-muted-foreground" : ""}`}>
    <span>{label}</span><span className="font-mono">{value}</span>
  </div>
);

/* ===== Pay Slip PDF Dialog ===== */

const PayslipPdfDialog = ({ employee, onClose, t }: {
  employee: Employee | null; onClose: () => void; t: (k: string) => string;
}) => {
  const fmtDZD = useFmtDZD();
  const { lang, dir } = useApp();
  const fmtNum = useFmtNum();
  const employerRate = useEmployerRate();
  if (!employee) return null;
  const p = computePayslip(employee as PayrollEmployee);
  const period = new Date().toISOString().slice(0, 7);

  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const printSlip = () => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(t("ps_title"))} — ${esc(employee.name)}</title>
      <style>
        body { font-family: 'Helvetica', Arial, sans-serif; padding: 32px; color: #1f2937; }
        .head { display:flex; justify-content:space-between; border-bottom:2px solid #0f766e; padding-bottom:12px; margin-bottom:18px; }
        .h-title { color:#0f766e; font-size:18px; font-weight:700; letter-spacing:1px; }
        .h-sub { color:#6b7280; font-size:11px; text-transform:uppercase; letter-spacing:1px; }
        .meta { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; font-size:12px; margin-bottom:16px; }
        .meta b { color:#0f766e; }
        table { width:100%; border-collapse:collapse; font-size:13px; }
        th, td { padding:8px 10px; border-bottom:1px solid #e5e7eb; }
        th { text-align:left; background:#f0fdfa; color:#0f766e; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }
        .num { text-align:right; font-family:'Courier New', monospace; }
        .neg { color:#dc2626; }
        .total { background:linear-gradient(135deg,#fef3c7,#fde68a); border:1px solid #d4a017; padding:14px; border-radius:8px; margin-top:16px; display:flex; justify-content:space-between; align-items:center; }
        .total b { color:#0f766e; font-size:14px; }
        .total span { color:#a16207; font-size:22px; font-weight:700; font-family:'Courier New', monospace; }
        .foot { margin-top:32px; display:flex; justify-content:space-between; font-size:11px; color:#6b7280; }
        .stamp { border:1px dashed #9ca3af; padding:24px 12px; min-width:160px; text-align:center; }
      </style></head><body>
      <div class="head">
        <div>
          <div class="h-title">${esc(t("ps_title"))}</div>
          <div class="h-sub">${esc(t("ps_period"))} ${period}</div>
        </div>
        <div style="text-align:end;">
          <div class="h-title" style="font-size:14px;">Managementik</div>
          <div class="h-sub">${esc(t("ps_republic"))}</div>
        </div>
      </div>
      <div class="meta">
        <div><b>${esc(t("pay_employee"))} :</b> ${esc(employee.name)}</div>
        <div><b>${esc(t("ps_cnas_id"))} :</b> ${esc(employee.nss || "—")}</div>
        <div><b>${esc(t("pay_position"))} :</b> ${esc(employee.position || "—")}</div>
        <div><b>${esc(t("ps_hire_date"))} :</b> ${esc(employee.hireDate || "—")}</div>
      </div>
      <table>
        <thead><tr><th>${esc(t("ps_designation"))}</th><th class="num">${esc(t("ps_gain"))}</th><th class="num">${esc(t("ps_deduction"))}</th></tr></thead>
        <tbody>
          <tr><td>${esc(t("pay_basic"))}</td><td class="num">${fmtNum(p.basic)}</td><td></td></tr>
          <tr><td>${esc(t("pay_iew"))}</td><td class="num">${fmtNum(p.iew)}</td><td></td></tr>
          <tr><td>${esc(t("pay_prc"))}</td><td class="num">${fmtNum(p.prc)}</td><td></td></tr>
          ${p.other ? `<tr><td>${esc(t("payx_other_indemnities"))}</td><td class="num">${fmtNum(p.other)}</td><td></td></tr>` : ""}
          <tr style="background:#f9fafb;"><td><b>${esc(t("pay_gross"))}</b></td><td class="num"><b>${fmtNum(p.gross)}</b></td><td></td></tr>
          <tr><td>${esc(t("pay_ss"))}</td><td></td><td class="num neg">${fmtNum(p.ssEmployee)}</td></tr>
          <tr><td>${esc(t("payx_taxable"))}</td><td class="num">${fmtNum(p.taxable)}</td><td></td></tr>
          <tr><td>${esc(t("pay_irg"))}</td><td></td><td class="num neg">${fmtNum(p.irg)}</td></tr>
        </tbody>
      </table>
      <div class="total"><b>${esc(t("ps_net_to_pay"))}</b><span>${fmtNum(p.net)} DA</span></div>
      <div style="margin-top:20px; padding:10px; background:#f0fdfa; border-radius:6px; font-size:11px; color:#0f766e;">
        <b>${esc(t("ps_employer_charges"))}:</b> ${esc(t("payx_ss_employer"))} ${employerRate}% = ${fmtNum(p.ssEmployer)} DA — ${esc(t("payx_employer_cost"))}: <b>${fmtNum(p.employerCost)} DA</b>
      </div>
      <div class="foot">
        <div>${esc(t("ps_issued"))} ${formatDate(new Date(), lang)}</div>
        <div class="stamp">${esc(t("ps_stamp"))}</div>
      </div>
      </body></html>`);
    w.document.close();
    // Print from the opener: no inline script in the popup (CSP-friendly).
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  return (
    <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gold-deep" /> {t("pay_payslip")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between border-b pb-2">
            <div>
              <div className="font-semibold">{employee.name}</div>
              <div className="text-xs text-muted-foreground">{employee.position || "—"}</div>
            </div>
            <div className="text-end text-xs text-muted-foreground">{period}</div>
          </div>
          <Line label={t("pay_basic")} value={fmtDZD(p.basic)} />
          <Line label={t("pay_iew")} value={fmtDZD(p.iew)} />
          <Line label={t("pay_prc")} value={fmtDZD(p.prc)} />
          {p.other ? <Line label={t("payx_other_indemnities")} value={fmtDZD(p.other)} /> : null}
          <Line label={t("pay_gross")} value={fmtDZD(p.gross)} bold />
          <Line label={t("pay_ss")} value={`- ${fmtDZD(p.ssEmployee)}`} muted />
          <Line label={t("payx_taxable")} value={fmtDZD(p.taxable)} />
          <Line label={t("pay_irg")} value={`- ${fmtDZD(p.irg)}`} muted />
          <div className="flex justify-between p-3 rounded-lg bg-linear-to-br from-gold/15 to-gold/5 border border-gold/40 mt-2">
            <span className="font-semibold text-primary">{t("pay_net")}</span>
            <span className="text-xl font-bold text-gold-deep">{fmtDZD(p.net)}</span>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            {t("payx_ss_employer")} {employerRate}%: {fmtDZD(p.ssEmployer)} • {t("payx_employer_cost")}: {fmtDZD(p.employerCost)}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={printSlip} variant="gold"><Printer className="h-4 w-4" /> {t("payx_payslip_pdf")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

