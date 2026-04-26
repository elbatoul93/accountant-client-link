import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Inbox, Users, FileText, BookOpen, FileDown, Receipt } from "lucide-react";
import { toast } from "sonner";

const fmtDZD = (n: number) =>
  `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(n)} DA`;

/* ===== Types ===== */
export interface Employee {
  id: string; clientId?: string; name: string; position?: string;
  basic: number; iew: number; prc: number;
}
export interface BillInvoice {
  id: string; kind: "purchase" | "sales"; clientId?: string; clientName?: string;
  number: string; date: string; party: string;
  ht: number; tvaRate: number; tva: number; ttc: number;
}
export interface JournalEntry {
  id: string; date: string; account: string; label: string;
  debit: number; credit: number; clientId?: string;
}

export const KEY_EMPLOYEES = "mgmtk_acc_employees";
export const KEY_BILLS = "mgmtk_acc_bills";
export const KEY_JOURNAL = "mgmtk_acc_journal";

const load = <T,>(k: string): T[] => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : [];
};

const Empty = ({ label }: { label: string }) => (
  <div className="text-center py-10 border border-dashed border-border rounded-lg">
    <div className="inline-flex p-3 rounded-full bg-muted text-muted-foreground mb-3">
      <Inbox className="h-6 w-6" />
    </div>
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
);

/* ===== Hooks ===== */
export function useSuiteData() {
  const [employees, setEmployees] = useState<Employee[]>(() => load<Employee>(KEY_EMPLOYEES));
  const [bills, setBills] = useState<BillInvoice[]>(() => load<BillInvoice>(KEY_BILLS));
  const [journal, setJournal] = useState<JournalEntry[]>(() => load<JournalEntry>(KEY_JOURNAL));
  useEffect(() => { localStorage.setItem(KEY_EMPLOYEES, JSON.stringify(employees)); }, [employees]);
  useEffect(() => { localStorage.setItem(KEY_BILLS, JSON.stringify(bills)); }, [bills]);
  useEffect(() => { localStorage.setItem(KEY_JOURNAL, JSON.stringify(journal)); }, [journal]);
  return { employees, setEmployees, bills, setBills, journal, setJournal };
}

/** Aggregate totals for G50 sync (per client, all-time, in DA). */
export function aggregateForG50(
  clientId: string,
  bills: BillInvoice[],
  employees: Employee[],
) {
  const cBills = bills.filter((b) => b.clientId === clientId);
  const sales = cBills.filter((b) => b.kind === "sales");
  const purchases = cBills.filter((b) => b.kind === "purchase");
  const caHt = sales.reduce((s, b) => s + b.ht, 0);
  const tvaCollected = sales.reduce((s, b) => s + b.tva, 0);
  const tvaDeductible = purchases.reduce((s, b) => s + b.tva, 0);
  const tvaDue = Math.max(0, tvaCollected - tvaDeductible);
  const cEmps = employees.filter((e) => !e.clientId || e.clientId === clientId);
  const salaries = cEmps.reduce((s, e) => s + e.basic + e.iew + e.prc, 0);
  return { caHt, tvaCollected, tvaDeductible, tvaDue, salaries };
}

/* ===== Payroll ===== */
type ClientLite = { id: string; name: string };

export const PayrollView = ({
  t, employees, setEmployees, clients,
}: {
  t: (k: string) => string; employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  clients: ClientLite[];
}) => {
  const [open, setOpen] = useState(false);
  const [slip, setSlip] = useState<Employee | null>(null);

  return (
    <Card className="p-5 shadow-card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <Users className="h-4 w-4" /> {t("pay_title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("pay_subtitle")}</p>
        </div>
        <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> {t("pay_add_employee")}
        </Button>
      </div>

      {employees.length === 0 ? (
        <Empty label={t("pay_no_employees")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                <th className="text-start font-medium py-2.5">{t("pay_employee")}</th>
                <th className="text-start font-medium py-2.5 hidden md:table-cell">{t("pay_position")}</th>
                <th className="text-end font-medium py-2.5">{t("pay_basic")}</th>
                <th className="text-end font-medium py-2.5 hidden sm:table-cell">{t("pay_iew")}</th>
                <th className="text-end font-medium py-2.5 hidden sm:table-cell">{t("pay_prc")}</th>
                <th className="text-end font-medium py-2.5">{t("pay_net")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const gross = e.basic + e.iew + e.prc;
                const ss = gross * 0.09;
                const taxable = gross - ss;
                const irg = computeIRG(taxable);
                const net = gross - ss - irg;
                return (
                  <tr key={e.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                    <td className="py-3 font-semibold">{e.name}</td>
                    <td className="py-3 text-muted-foreground hidden md:table-cell">{e.position || "—"}</td>
                    <td className="py-3 text-end font-mono text-xs">{fmtDZD(e.basic)}</td>
                    <td className="py-3 text-end font-mono text-xs hidden sm:table-cell">{fmtDZD(e.iew)}</td>
                    <td className="py-3 text-end font-mono text-xs hidden sm:table-cell">{fmtDZD(e.prc)}</td>
                    <td className="py-3 text-end font-bold text-gold-deep">{fmtDZD(net)}</td>
                    <td className="py-3 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setSlip(e)}>
                          <FileDown className="h-3.5 w-3.5" /> {t("pay_generate_slip")}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setEmployees((p) => p.filter((x) => x.id !== e.id))}>
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

      <AddEmployeeDialog open={open} onOpenChange={setOpen} clients={clients} t={t}
        onAdd={(emp) => { setEmployees((p) => [emp, ...p]); setOpen(false); }} />

      <PayslipDialog employee={slip} onClose={() => setSlip(null)} t={t} />
    </Card>
  );
};

const computeIRG = (taxable: number): number => {
  // Algerian IRG monthly brackets (simplified)
  let irg = 0;
  if (taxable <= 30000) return 0;
  let remaining = taxable;
  const brackets = [
    { upTo: 30000, rate: 0 },
    { upTo: 35000, rate: 0.20 },
    { upTo: 40000, rate: 0.23 },
    { upTo: 80000, rate: 0.27 },
    { upTo: 160000, rate: 0.30 },
    { upTo: 320000, rate: 0.33 },
    { upTo: Infinity, rate: 0.35 },
  ];
  let prev = 0;
  for (const b of brackets) {
    if (remaining <= 0) break;
    const slice = Math.min(taxable, b.upTo) - prev;
    if (slice > 0) irg += slice * b.rate;
    prev = b.upTo;
    if (taxable <= b.upTo) break;
  }
  return Math.round(irg);
};

const AddEmployeeDialog = ({
  open, onOpenChange, clients, onAdd, t,
}: { open: boolean; onOpenChange: (o: boolean) => void; clients: ClientLite[];
     onAdd: (e: Employee) => void; t: (k: string) => string }) => {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [clientId, setClientId] = useState<string>("none");
  const [basic, setBasic] = useState("");
  const [iew, setIew] = useState("");
  const [prc, setPrc] = useState("");

  const submit = () => {
    if (!name.trim() || !basic) { toast.error(`${t("pay_employee")} & ${t("pay_basic")}`); return; }
    onAdd({
      id: crypto.randomUUID(),
      clientId: clientId === "none" ? undefined : clientId,
      name: name.trim(), position: position.trim() || undefined,
      basic: Number(basic), iew: Number(iew || 0), prc: Number(prc || 0),
    });
    toast.success("Employé ajouté");
    setName(""); setPosition(""); setClientId("none"); setBasic(""); setIew(""); setPrc("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("pay_add_employee")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">{t("pay_employee")} *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Karim B." /></div>
            <div className="space-y-1.5"><Label className="text-xs">{t("pay_position")}</Label><Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Comptable" /></div>
          </div>
          {clients.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Client (optionnel)</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Cabinet —</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">{t("pay_basic")} *</Label><Input type="number" value={basic} onChange={(e) => setBasic(e.target.value)} placeholder="40000" /></div>
            <div className="space-y-1.5"><Label className="text-xs">{t("pay_iew")}</Label><Input type="number" value={iew} onChange={(e) => setIew(e.target.value)} placeholder="3000" /></div>
            <div className="space-y-1.5"><Label className="text-xs">{t("pay_prc")}</Label><Input type="number" value={prc} onChange={(e) => setPrc(e.target.value)} placeholder="5000" /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{t("acc_save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PayslipDialog = ({ employee, onClose, t }: { employee: Employee | null; onClose: () => void; t: (k: string) => string }) => {
  if (!employee) return null;
  const gross = employee.basic + employee.iew + employee.prc;
  const ss = Math.round(gross * 0.09);
  const taxable = gross - ss;
  const irg = computeIRG(taxable);
  const net = gross - ss - irg;
  const print = () => window.print();
  return (
    <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gold-deep" /> {t("pay_payslip")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between border-b pb-2"><span className="font-semibold">{employee.name}</span><span className="text-muted-foreground">{employee.position}</span></div>
          <Row label={t("pay_basic")} value={fmtDZD(employee.basic)} />
          <Row label={t("pay_iew")} value={fmtDZD(employee.iew)} />
          <Row label={t("pay_prc")} value={fmtDZD(employee.prc)} />
          <Row label={t("pay_gross")} value={fmtDZD(gross)} bold />
          <Row label={t("pay_ss")} value={`- ${fmtDZD(ss)}`} muted />
          <Row label={t("pay_irg")} value={`- ${fmtDZD(irg)}`} muted />
          <div className="flex justify-between p-3 rounded-lg bg-gradient-to-br from-gold/15 to-gold/5 border border-gold/40 mt-2">
            <span className="font-semibold text-primary">{t("pay_net")}</span>
            <span className="text-xl font-bold text-gold-deep">{fmtDZD(net)}</span>
          </div>
        </div>
        <DialogFooter><Button onClick={print} variant="gold">{t("cli_download")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Row = ({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) => (
  <div className={`flex justify-between ${bold ? "font-bold" : ""} ${muted ? "text-muted-foreground" : ""}`}>
    <span>{label}</span><span className="font-mono">{value}</span>
  </div>
);

/* ===== Billing ===== */
export const BillingView = ({
  t, bills, setBills, clients,
}: {
  t: (k: string) => string; bills: BillInvoice[];
  setBills: React.Dispatch<React.SetStateAction<BillInvoice[]>>;
  clients: ClientLite[];
}) => {
  const [open, setOpen] = useState(false);
  const sales = bills.filter((b) => b.kind === "sales");
  const purchases = bills.filter((b) => b.kind === "purchase");
  const totalSalesHT = sales.reduce((s, b) => s + b.ht, 0);
  const tvaCollected = sales.reduce((s, b) => s + b.tva, 0);
  const tvaDeductible = purchases.reduce((s, b) => s + b.tva, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Mini label={t("bill_sales")} value={fmtDZD(totalSalesHT)} />
        <Mini label={`${t("bill_tva")} ${t("bill_sales")}`} value={fmtDZD(tvaCollected)} />
        <Mini label={`${t("bill_tva")} ${t("bill_purchase")}`} value={fmtDZD(tvaDeductible)} />
        <Mini label={`${t("bill_tva")} dûe`} value={fmtDZD(Math.max(0, tvaCollected - tvaDeductible))} gold />
      </div>

      <Card className="p-5 shadow-card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
              <Receipt className="h-4 w-4" /> {t("bill_title")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("bill_subtitle")}</p>
          </div>
          <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {t("bill_add")}
          </Button>
        </div>
        {bills.length === 0 ? <Empty label={t("bill_no_invoices")} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                  <th className="text-start py-2.5 font-medium">{t("bill_kind")}</th>
                  <th className="text-start py-2.5 font-medium">{t("bill_number")}</th>
                  <th className="text-start py-2.5 font-medium">{t("bill_party")}</th>
                  <th className="text-start py-2.5 font-medium hidden md:table-cell">{t("dash_client")}</th>
                  <th className="text-end py-2.5 font-medium">{t("bill_ht")}</th>
                  <th className="text-end py-2.5 font-medium hidden sm:table-cell">{t("bill_tva")}</th>
                  <th className="text-end py-2.5 font-medium">{t("bill_ttc")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                    <td className="py-3">
                      <Badge variant="outline" className={`text-[10px] capitalize ${b.kind === "sales" ? "border-primary/40 text-primary bg-primary/5" : "border-gold-deep/40 text-gold-deep bg-gold/5"}`}>
                        {b.kind === "sales" ? t("bill_sales") : t("bill_purchase")}
                      </Badge>
                    </td>
                    <td className="py-3 font-mono text-xs">{b.number}</td>
                    <td className="py-3">{b.party}</td>
                    <td className="py-3 text-muted-foreground text-xs hidden md:table-cell">{b.clientName || "—"}</td>
                    <td className="py-3 text-end font-mono text-xs">{fmtDZD(b.ht)}</td>
                    <td className="py-3 text-end font-mono text-xs hidden sm:table-cell">{fmtDZD(b.tva)}</td>
                    <td className="py-3 text-end font-bold text-gold-deep">{fmtDZD(b.ttc)}</td>
                    <td className="py-3 text-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setBills((p) => p.filter((x) => x.id !== b.id))}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddBillDialog open={open} onOpenChange={setOpen} clients={clients} t={t}
        onAdd={(b) => { setBills((p) => [b, ...p]); setOpen(false); }} />
    </div>
  );
};

const Mini = ({ label, value, gold }: { label: string; value: string; gold?: boolean }) => (
  <Card className={`p-4 shadow-card ${gold ? "border-gold/40 bg-gradient-to-br from-gold/10 to-card" : ""}`}>
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-lg font-bold mt-1 ${gold ? "text-gold-deep" : "text-foreground"}`}>{value}</div>
  </Card>
);

const AddBillDialog = ({
  open, onOpenChange, clients, onAdd, t,
}: { open: boolean; onOpenChange: (o: boolean) => void; clients: ClientLite[];
     onAdd: (b: BillInvoice) => void; t: (k: string) => string }) => {
  const [kind, setKind] = useState<"purchase" | "sales">("sales");
  const [number, setNumber] = useState("");
  const [party, setParty] = useState("");
  const [clientId, setClientId] = useState<string>("none");
  const [ht, setHt] = useState("");
  const [rate, setRate] = useState("19");
  const tva = (Number(ht || 0) * Number(rate || 0)) / 100;
  const ttc = Number(ht || 0) + tva;
  const submit = () => {
    if (!number.trim() || !party.trim() || !ht) { toast.error("Champs requis"); return; }
    const c = clients.find((x) => x.id === clientId);
    onAdd({
      id: crypto.randomUUID(), kind, number: number.trim(), party: party.trim(),
      clientId: c?.id, clientName: c?.name,
      date: new Date().toLocaleDateString("fr-DZ"),
      ht: Number(ht), tvaRate: Number(rate), tva: Math.round(tva), ttc: Math.round(ttc),
    });
    toast.success("Facture enregistrée");
    setNumber(""); setParty(""); setClientId("none"); setHt(""); setRate("19");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("bill_add")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("bill_kind")}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">{t("bill_sales")}</SelectItem>
                  <SelectItem value="purchase">{t("bill_purchase")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">{t("bill_number")}</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="F-2025-001" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">{t("bill_party")}</Label><Input value={party} onChange={(e) => setParty(e.target.value)} placeholder="Fournisseur / Client X" /></div>
          {clients.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("dash_client")}</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">{t("bill_ht")}</Label><Input type="number" value={ht} onChange={(e) => setHt(e.target.value)} placeholder="100000" /></div>
            <div className="space-y-1.5"><Label className="text-xs">{t("bill_tva_rate")} (%)</Label><Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-br from-gold/10 to-card border border-gold/30 space-y-1">
            <div className="flex justify-between text-sm"><span>{t("bill_tva")}</span><span className="font-mono">{fmtDZD(tva)}</span></div>
            <div className="flex justify-between text-base font-bold"><span className="text-primary">{t("bill_ttc")}</span><span className="font-mono text-gold-deep">{fmtDZD(ttc)}</span></div>
          </div>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{t("acc_save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ===== Journal ===== */
export const JournalView = ({
  t, journal, setJournal, clients,
}: {
  t: (k: string) => string; journal: JournalEntry[];
  setJournal: React.Dispatch<React.SetStateAction<JournalEntry[]>>;
  clients: ClientLite[];
}) => {
  const [open, setOpen] = useState(false);
  const totalDebit = journal.reduce((s, j) => s + j.debit, 0);
  const totalCredit = journal.reduce((s, j) => s + j.credit, 0);
  const balance = totalDebit - totalCredit;
  return (
    <Card className="p-5 shadow-card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> {t("jrn_title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("jrn_subtitle")}</p>
        </div>
        <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> {t("jrn_add")}
        </Button>
      </div>

      {journal.length === 0 ? <Empty label={t("jrn_no_entries")} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                <th className="text-start py-2.5 font-medium">{t("dash_date")}</th>
                <th className="text-start py-2.5 font-medium">{t("jrn_account")}</th>
                <th className="text-start py-2.5 font-medium">{t("jrn_label")}</th>
                <th className="text-end py-2.5 font-medium">{t("jrn_debit")}</th>
                <th className="text-end py-2.5 font-medium">{t("jrn_credit")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {journal.map((j) => (
                <tr key={j.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                  <td className="py-3 text-xs text-muted-foreground">{j.date}</td>
                  <td className="py-3 font-mono text-xs">{j.account}</td>
                  <td className="py-3">{j.label}</td>
                  <td className="py-3 text-end font-mono text-xs">{j.debit ? fmtDZD(j.debit) : "—"}</td>
                  <td className="py-3 text-end font-mono text-xs">{j.credit ? fmtDZD(j.credit) : "—"}</td>
                  <td className="py-3 text-end">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setJournal((p) => p.filter((x) => x.id !== j.id))}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-bold">
                <td colSpan={3} className="py-3 text-end text-xs uppercase text-muted-foreground">{t("jrn_balance")}</td>
                <td className="py-3 text-end font-mono">{fmtDZD(totalDebit)}</td>
                <td className="py-3 text-end font-mono">{fmtDZD(totalCredit)}</td>
                <td className="py-3 text-end">
                  <Badge variant="outline" className={balance === 0 ? "border-primary/40 text-primary bg-primary/5" : "border-destructive/40 text-destructive bg-destructive/5"}>
                    {balance === 0 ? "✓" : fmtDZD(balance)}
                  </Badge>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <AddJournalDialog open={open} onOpenChange={setOpen} clients={clients} t={t}
        onAdd={(rows) => { setJournal((p) => [...rows, ...p]); setOpen(false); }} />
    </Card>
  );
};

const PCN_HINTS = [
  "101 — Capital",
  "401 — Fournisseurs",
  "411 — Clients",
  "445 — TVA",
  "512 — Banque",
  "530 — Caisse",
  "601 — Achats",
  "631 — Salaires",
  "701 — Ventes",
];

const AddJournalDialog = ({
  open, onOpenChange, clients, onAdd, t,
}: { open: boolean; onOpenChange: (o: boolean) => void; clients: ClientLite[];
     onAdd: (rows: JournalEntry[]) => void; t: (k: string) => string }) => {
  type Row = { account: string; label: string; debit: string; credit: string };
  const blank: Row = { account: "", label: "", debit: "", credit: "" };
  const [rows, setRows] = useState<Row[]>([{ ...blank }, { ...blank }]);
  const [clientId, setClientId] = useState<string>("none");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  const update = (i: number, k: keyof Row, v: string) =>
    setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  const submit = () => {
    if (!balanced) { toast.error(t("jrn_unbalanced")); return; }
    const valid = rows.filter((r) => r.account && (r.debit || r.credit));
    if (valid.length === 0) { toast.error("Aucune ligne"); return; }
    onAdd(valid.map((r) => ({
      id: crypto.randomUUID(), date, account: r.account.trim(), label: r.label.trim() || "—",
      debit: Number(r.debit || 0), credit: Number(r.credit || 0),
      clientId: clientId === "none" ? undefined : clientId,
    })));
    toast.success("Écriture enregistrée");
    setRows([{ ...blank }, { ...blank }]); setClientId("none");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("jrn_add")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">{t("dash_date")}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            {clients.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("dash_client")}</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">PCN: {PCN_HINTS.join(" · ")}</div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-2 font-mono text-xs h-9" placeholder="411" value={r.account} onChange={(e) => update(i, "account", e.target.value)} />
                <Input className="col-span-4 h-9" placeholder={t("jrn_label")} value={r.label} onChange={(e) => update(i, "label", e.target.value)} />
                <Input className="col-span-3 h-9 text-end font-mono text-xs" placeholder={t("jrn_debit")} type="number" value={r.debit} onChange={(e) => update(i, "debit", e.target.value)} />
                <Input className="col-span-3 h-9 text-end font-mono text-xs" placeholder={t("jrn_credit")} type="number" value={r.credit} onChange={(e) => update(i, "credit", e.target.value)} />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setRows((p) => [...p, { ...blank }])}>
              <Plus className="h-3.5 w-3.5" /> Ligne
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm font-semibold">
            <div className="p-2 rounded border border-border/60 text-center">{t("jrn_debit")}: <span className="font-mono">{fmtDZD(totalDebit)}</span></div>
            <div className="p-2 rounded border border-border/60 text-center">{t("jrn_credit")}: <span className="font-mono">{fmtDZD(totalCredit)}</span></div>
            <div className={`p-2 rounded border text-center ${balanced ? "border-primary/40 bg-primary/5 text-primary" : "border-destructive/40 bg-destructive/5 text-destructive"}`}>
              {balanced ? "✓ Équilibré" : t("jrn_unbalanced")}
            </div>
          </div>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero" disabled={!balanced}>{t("acc_save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
