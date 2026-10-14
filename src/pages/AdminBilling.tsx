import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  billingRpc, daysLeft, type AdminSubscription, type Receipt,
} from "@/lib/billing";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "-");
const toIso = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : null);
const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

const ISSUER_FIELDS = ["legal_name", "rc", "nif", "nis", "address", "phone", "email"] as const;

const printReceipt = (r: Receipt) => {
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) { toast.error("Allow pop-ups to print the receipt."); return; }
  const issuer = ISSUER_FIELDS.filter((k) => r.issuer?.[k]).map((k) => `<div>${esc(k.toUpperCase().replace("_", " "))}: ${esc(r.issuer[k])}</div>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.receipt_no)}</title>
<style>body{font-family:sans-serif;padding:40px;max-width:640px;margin:auto}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:6px 0;border-bottom:1px solid #ddd}.void{color:#b00;font-weight:bold}</style></head><body>
${issuer}<h1>Payment receipt ${esc(r.receipt_no)}</h1>${r.voided_at ? `<p class="void">VOIDED ${esc(day(r.voided_at))}: ${esc(r.void_reason)}</p>` : ""}
<table>
<tr><td>Received from</td><td>${esc(r.payer?.name)}${r.payer?.company ? ` (${esc(r.payer.company)})` : ""}</td></tr>
<tr><td>Amount</td><td>${esc(r.amount)} ${esc(r.currency)}</td></tr>
<tr><td>Method</td><td>${esc(r.method)}</td></tr>
<tr><td>Plan</td><td>${esc(r.plan)}</td></tr>
<tr><td>Period</td><td>${esc(day(r.period_start))} - ${esc(day(r.period_end))} (${esc(r.period_months)} month(s))</td></tr>
<tr><td>Date paid</td><td>${esc(r.paid_at)}</td></tr>
${r.note ? `<tr><td>Note</td><td>${esc(r.note)}</td></tr>` : ""}
</table><p style="margin-top:48px">Signature and stamp</p></body></html>`);
  w.document.close();
  w.focus();
  w.print();
};

const stateVariant = (s: string) => (s === "read_only" || s === "grace" ? "destructive" : s === "active" ? "secondary" : "outline");

const Manage = ({ row, onChanged }: { row: AdminSubscription; onChanged: () => void }) => {
  const [plan, setPlan] = useState(row.plan);
  const [trial, setTrial] = useState(dateInput(row.trial_ends_at));
  const [paid, setPaid] = useState(dateInput(row.paid_until));
  const [grace, setGrace] = useState(String(row.grace_days));
  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState("12");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState(false);

  const loadReceipts = useCallback(async () => {
    const { data, error } = await billingRpc("admin_list_receipts", { _accountant_id: row.user_id });
    if (!error) setReceipts((data ?? []) as Receipt[]);
  }, [row.user_id]);
  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  const saveDates = async () => {
    setBusy(true);
    const { error } = await billingRpc("admin_set_subscription", {
      _accountant_id: row.user_id, _plan: plan, _trial_ends_at: toIso(trial), _paid_until: toIso(paid), _grace_days: Number(grace) || 7,
    });
    setBusy(false);
    if (error) { toast.error("Could not save the subscription."); return; }
    toast.success("Subscription saved.");
    onChanged();
  };

  const record = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) { toast.error("Enter the amount received."); return; }
    setBusy(true);
    const { data, error } = await billingRpc("admin_record_payment", {
      _accountant_id: row.user_id, _amount: amt, _period_months: Number(months) || 1, _method: method, _plan: plan || null, _note: note || null,
    });
    setBusy(false);
    if (error) { toast.error("Could not record the payment."); return; }
    toast.success("Payment recorded.");
    setAmount(""); setNote("");
    onChanged();
    await loadReceipts();
    const rec = (Array.isArray(data) ? data[0] : data) as Receipt | null;
    if (rec?.receipt_no) printReceipt(rec);
  };

  const voidReceipt = async (r: Receipt) => {
    const reason = window.prompt(`Reason for voiding ${r.receipt_no}? (the number is kept; paid-until is not shortened)`);
    if (!reason) return;
    const { error } = await billingRpc("admin_void_receipt", { _receipt_id: r.id, _reason: reason });
    if (error) { toast.error("Could not void the receipt."); return; }
    toast.success("Receipt voided.");
    await loadReceipts();
  };

  return (
    <div className="space-y-4 border-t border-border/60 bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div><Label htmlFor={`plan-${row.user_id}`}>Plan</Label><Input id={`plan-${row.user_id}`} value={plan} onChange={(e) => setPlan(e.target.value)} /></div>
        <div><Label htmlFor={`trial-${row.user_id}`}>Trial ends</Label><Input id={`trial-${row.user_id}`} type="date" value={trial} onChange={(e) => setTrial(e.target.value)} /></div>
        <div><Label htmlFor={`paid-${row.user_id}`}>Paid until</Label><Input id={`paid-${row.user_id}`} type="date" value={paid} onChange={(e) => setPaid(e.target.value)} /></div>
        <div><Label htmlFor={`grace-${row.user_id}`}>Grace days</Label><Input id={`grace-${row.user_id}`} type="number" min={0} value={grace} onChange={(e) => setGrace(e.target.value)} /></div>
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={saveDates}>Save dates</Button>

      <div className="grid gap-3 sm:grid-cols-4">
        <div><Label htmlFor={`amt-${row.user_id}`}>Amount (DZD)</Label><Input id={`amt-${row.user_id}`} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label htmlFor={`mon-${row.user_id}`}>Months</Label><Input id={`mon-${row.user_id}`} type="number" min={1} max={36} value={months} onChange={(e) => setMonths(e.target.value)} /></div>
        <div>
          <Label htmlFor={`met-${row.user_id}`}>Method</Label>
          <select id={`met-${row.user_id}`} value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="cash">Cash</option><option value="transfer">Transfer</option><option value="cheque">Cheque</option><option value="other">Other</option>
          </select>
        </div>
        <div><Label htmlFor={`note-${row.user_id}`}>Note</Label><Input id={`note-${row.user_id}`} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <Button size="sm" variant="hero" disabled={busy} onClick={record}>Record payment and print receipt</Button>

      {receipts.length > 0 && (
        <div className="divide-y divide-border/60 rounded-md border border-border/60 bg-background">
          {receipts.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-2 text-xs">
              <span className="font-mono font-semibold">{r.receipt_no}</span>
              <span>{r.amount} {r.currency} · {r.period_months} mo · {day(r.period_start)} to {day(r.period_end)}</span>
              {r.voided_at && <Badge variant="destructive">voided</Badge>}
              <span className="ms-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => printReceipt(r)}>Print</Button>
                {!r.voided_at && <Button size="sm" variant="ghost" onClick={() => voidReceipt(r)}>Void</Button>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const IssuerSettings = () => {
  const [issuer, setIssuer] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    billingRpc("admin_get_billing_settings").then(({ data, error }) => {
      if (!error && data && typeof data === "object") setIssuer(data as Record<string, string>);
      setReady(true);
    });
  }, []);
  const save = async () => {
    const { error } = await billingRpc("admin_set_billing_settings", { _issuer: issuer });
    if (error) toast.error("Could not save the receipt details."); else toast.success("Receipt details saved.");
  };
  if (!ready) return null;
  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="font-semibold text-primary">Receipt issuer details</h2>
        <p className="text-xs text-muted-foreground">Printed on every new receipt (company name, RC, NIF, NIS, address). Existing receipts keep the details they were issued with.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {ISSUER_FIELDS.map((k) => (
          <div key={k}>
            <Label htmlFor={`iss-${k}`}>{k.replace("_", " ")}</Label>
            <Input id={`iss-${k}`} value={issuer[k] ?? ""} onChange={(e) => setIssuer({ ...issuer, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={save}>Save</Button>
    </Card>
  );
};

// Operator-only screen (not translated): plans, payments and numbered receipts.
export const AdminBilling = () => {
  const [rows, setRows] = useState<AdminSubscription[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await billingRpc("admin_list_subscriptions");
    if (error) { setFailed(true); return; }
    setFailed(false);
    setRows((data ?? []) as AdminSubscription[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (failed) return <p role="alert" className="text-sm text-muted-foreground">Billing is not available yet: the subscriptions update has not been applied to the database.</p>;
  if (!rows) return null;

  return (
    <div className="space-y-4">
      <IssuerSettings />
      <Card className="divide-y divide-border/60">
        {rows.length === 0 && <p className="p-5 text-sm text-muted-foreground">No accountant accounts yet.</p>}
        {rows.map((r) => {
          const end = r.state === "trial" ? r.trial_ends_at : r.paid_until;
          const left = daysLeft(end);
          return (
            <div key={r.user_id}>
              <div className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{r.name || r.email}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.email} · {r.plan}{end ? ` · until ${day(end)}${left !== null ? ` (${left} d)` : ""}` : ""}</div>
                </div>
                <Badge variant={stateVariant(r.state)}>{r.state}</Badge>
                <Button size="sm" variant="outline" onClick={() => setOpen(open === r.user_id ? null : r.user_id)}>
                  {open === r.user_id ? "Close" : "Manage"}
                </Button>
              </div>
              {open === r.user_id && <Manage row={r} onChanged={load} />}
            </div>
          );
        })}
      </Card>
    </div>
  );
};

export default AdminBilling;
