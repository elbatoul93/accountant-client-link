// Database persistence for the accountant data that used to live only in localStorage
// (ARC-1): clients, employees, bills, journal, period locks, TVA précompte, fixed assets.
// Same diff-based pattern as accountantStore: the UI keeps its state arrays, and
// `syncX(prev, next, accId)` writes the difference. Writes throw on failure so callers can toast.
// Needs migration 20261014231000_business_data_tables.sql to be applied first.
//
// Id handling: rows use uuid ids. Legacy local ids that are not uuids are re-keyed on import
// (`importLocalBusinessData`), and a client's UI id is its `client_ref`.

import { supabase } from "@/integrations/supabase/client";
import type { Employee, BillInvoice, PrecompteMap } from "@/pages/accountant/SuiteModules";
import type { JournalLine, PeriodLock } from "@/lib/accounting/engine";
import type { FixedAsset } from "@/lib/accounting/assets";

type DbErr = { error: { message: string } | null };
const must = (res: DbErr) => { if (res.error) throw new Error(res.error.message); };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const toUuid = (id: string) => (UUID_RE.test(id) ? id : crypto.randomUUID());
const dateOrNull = (d?: string) => (d && d.length >= 10 ? d.slice(0, 10) : null);

export interface ClientRecord {
  id: string; name: string; company?: string; taxId: string; email?: string;
  taxRegime?: "REEL" | "SIMPLIFIE" | "IFU"; contact: string; status: "active" | "review";
  [extra: string]: unknown;
}

// Fields that have their own column; everything else a client has goes to the `data` json column.
const CLIENT_COLS = new Set(["id", "name", "company", "taxId", "email", "taxRegime", "status", "contact"]);
const camelToSnake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Generic diff: returns rows to upsert and ids to delete. */
const diff = <T extends { id: string }>(prev: T[], next: T[]) => {
  const a = new Map(prev.map((x) => [x.id, x]));
  const b = new Map(next.map((x) => [x.id, x]));
  const upserts = next.filter((x) => !a.has(x.id) || JSON.stringify(a.get(x.id)) !== JSON.stringify(x));
  const deletes = prev.filter((x) => !b.has(x.id)).map((x) => x.id);
  return { upserts, deletes };
};

/* ---------------- clients ---------------- */
const clientRow = (c: ClientRecord, accId: string) => {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) if (!CLIENT_COLS.has(k) && v !== undefined) data[camelToSnake(k)] = v;
  return {
    accountant_id: accId, client_ref: c.id, name: c.name, company: c.company ?? null,
    tax_id: c.taxId ?? null, email: c.email || c.contact || null,
    tax_regime: c.taxRegime ?? null, status: c.status, data: data as never,
  };
};

export const loadClients = async (accId: string): Promise<ClientRecord[]> => {
  const { data, error } = await supabase.from("acc_clients").select("*")
    .eq("accountant_id", accId).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries((r.data ?? {}) as Record<string, unknown>)) extra[snakeToCamel(k)] = v;
    return {
      ...extra, id: r.client_ref, name: r.name, company: r.company ?? undefined,
      taxId: r.tax_id ?? "", email: r.email ?? undefined, contact: r.email ?? "",
      taxRegime: (r.tax_regime ?? undefined) as ClientRecord["taxRegime"],
      status: r.status as ClientRecord["status"],
    };
  });
};

export const syncClients = async (prev: ClientRecord[], next: ClientRecord[], accId: string) => {
  const { upserts, deletes } = diff(prev, next);
  if (upserts.length) {
    must(await supabase.from("acc_clients")
      .upsert(upserts.map((c) => clientRow(c, accId)), { onConflict: "accountant_id,client_ref" }));
  }
  if (deletes.length) must(await supabase.from("acc_clients").delete().eq("accountant_id", accId).in("client_ref", deletes));
};

/* ---------------- employees ---------------- */
export const loadEmployees = async (accId: string): Promise<Employee[]> => {
  const { data, error } = await supabase.from("acc_employees").select("*")
    .eq("accountant_id", accId).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, clientId: r.client_ref ?? undefined, name: r.name, position: r.position ?? undefined,
    basic: Number(r.basic), iew: Number(r.iew), prc: Number(r.prc), other: Number(r.other),
    dependents: r.dependents, nss: r.nss ?? undefined,
    hireDate: r.hire_date ?? undefined, endDate: r.end_date ?? undefined,
  }));
};

export const syncEmployees = async (prev: Employee[], next: Employee[], accId: string) => {
  const { upserts, deletes } = diff(prev, next);
  if (upserts.length) {
    must(await supabase.from("acc_employees").upsert(upserts.map((e) => ({
      id: e.id, accountant_id: accId, client_ref: e.clientId ?? null, name: e.name,
      position: e.position ?? null, basic: e.basic, iew: e.iew, prc: e.prc, other: e.other ?? 0,
      dependents: e.dependents ?? 0, nss: e.nss ?? null,
      hire_date: dateOrNull(e.hireDate), end_date: dateOrNull(e.endDate),
    }))));
  }
  if (deletes.length) must(await supabase.from("acc_employees").delete().in("id", deletes));
};

/* ---------------- bills ---------------- */
export const loadBills = async (accId: string): Promise<BillInvoice[]> => {
  const { data, error } = await supabase.from("acc_bills").select("*")
    .eq("accountant_id", accId).order("bill_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, kind: r.kind as BillInvoice["kind"], clientId: r.client_ref ?? undefined,
    number: r.number, date: r.bill_date, party: r.party, partyTaxId: r.party_tax_id ?? undefined,
    ht: Number(r.ht), tvaRate: Number(r.tva_rate), tva: Number(r.tva), ttc: Number(r.ttc),
    account: r.account ?? undefined, postedBatch: r.posted_batch ?? undefined,
  }));
};

export const syncBills = async (prev: BillInvoice[], next: BillInvoice[], accId: string) => {
  const { upserts, deletes } = diff(prev, next);
  if (upserts.length) {
    must(await supabase.from("acc_bills").upsert(upserts.map((b) => ({
      id: b.id, accountant_id: accId, client_ref: b.clientId ?? null, kind: b.kind, number: b.number,
      bill_date: b.date.slice(0, 10), party: b.party, party_tax_id: b.partyTaxId ?? null,
      ht: b.ht, tva_rate: b.tvaRate, tva: b.tva, ttc: b.ttc,
      account: b.account ?? null, posted_batch: b.postedBatch ?? null,
    }))));
  }
  if (deletes.length) must(await supabase.from("acc_bills").delete().in("id", deletes));
};

/* ---------------- journal ---------------- */
export const loadJournal = async (accId: string): Promise<JournalLine[]> => {
  const { data, error } = await supabase.from("acc_journal_lines").select("*")
    .eq("accountant_id", accId).order("entry_date").limit(10000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, date: r.entry_date, period: r.period, account: r.account, label: r.label,
    debit: Number(r.debit), credit: Number(r.credit), clientId: r.client_ref ?? undefined,
    source: r.source as JournalLine["source"], batchId: r.batch_id, sourceRef: r.source_ref ?? undefined,
  }));
};

export const syncJournal = async (prev: JournalLine[], next: JournalLine[], accId: string) => {
  const { upserts, deletes } = diff(prev, next);
  // The database refuses changes in locked periods, so deletes go first and a failure aborts the rest.
  if (deletes.length) must(await supabase.from("acc_journal_lines").delete().in("id", deletes));
  if (upserts.length) {
    must(await supabase.from("acc_journal_lines").upsert(upserts.map((l) => ({
      id: l.id, accountant_id: accId, client_ref: l.clientId ?? null, entry_date: l.date.slice(0, 10),
      period: l.period, account: l.account, label: l.label, debit: l.debit, credit: l.credit,
      source: l.source, batch_id: l.batchId, source_ref: l.sourceRef ?? null,
    }))));
  }
};

/* ---------------- period locks ---------------- */
export const loadLocks = async (accId: string): Promise<PeriodLock[]> => {
  const { data, error } = await supabase.from("acc_period_locks").select("*").eq("accountant_id", accId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    key: `${r.client_ref ?? "_"}__${r.period}`, clientId: r.client_ref ?? undefined,
    period: r.period, validatedAt: r.validated_at, reference: r.reference ?? "",
  }));
};

export const syncLocks = async (prev: PeriodLock[], next: PeriodLock[], accId: string) => {
  const a = new Map(prev.map((x) => [x.key, x]));
  const b = new Map(next.map((x) => [x.key, x]));
  const adds = next.filter((x) => !a.has(x.key));
  if (adds.length) {
    must(await supabase.from("acc_period_locks").insert(adds.map((l) => ({
      accountant_id: accId, client_ref: l.clientId ?? null, period: l.period,
      validated_at: l.validatedAt, reference: l.reference || null,
    }))));
  }
  for (const l of prev.filter((x) => !b.has(x.key))) {
    let q = supabase.from("acc_period_locks").delete().eq("accountant_id", accId).eq("period", l.period);
    q = l.clientId ? q.eq("client_ref", l.clientId) : q.is("client_ref", null);
    must(await q);
  }
};

/* ---------------- TVA précompte ---------------- */
const parsePrecompteKey = (k: string) => {
  const [client, period] = k.split("__");
  return { client_ref: client === "_" ? "" : client, period };
};

export const loadPrecompte = async (accId: string): Promise<PrecompteMap> => {
  const { data, error } = await supabase.from("acc_tva_precompte").select("*").eq("accountant_id", accId);
  if (error) throw new Error(error.message);
  const out: PrecompteMap = {};
  for (const r of data ?? []) out[`${r.client_ref || "_"}__${r.period}`] = Number(r.amount);
  return out;
};

export const syncPrecompte = async (prev: PrecompteMap, next: PrecompteMap, accId: string) => {
  const changed = Object.keys(next).filter((k) => prev[k] !== next[k]);
  if (changed.length) {
    must(await supabase.from("acc_tva_precompte").upsert(
      changed.map((k) => ({ accountant_id: accId, ...parsePrecompteKey(k), amount: next[k] })),
    ));
  }
  for (const k of Object.keys(prev).filter((k) => !(k in next))) {
    const { client_ref, period } = parsePrecompteKey(k);
    must(await supabase.from("acc_tva_precompte").delete()
      .eq("accountant_id", accId).eq("client_ref", client_ref).eq("period", period));
  }
};

/* ---------------- fixed assets ---------------- */
export const loadAssets = async (accId: string): Promise<FixedAsset[]> => {
  const { data, error } = await supabase.from("acc_assets").select("*")
    .eq("accountant_id", accId).order("acquired_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, clientId: r.client_ref ?? undefined, label: r.label,
    category: r.category as FixedAsset["category"], acquiredAt: r.acquired_at, cost: Number(r.cost),
    rateOverride: r.rate_override === null ? undefined : Number(r.rate_override),
  }) as FixedAsset);
};

export const syncAssets = async (prev: FixedAsset[], next: FixedAsset[], accId: string) => {
  const { upserts, deletes } = diff(prev, next);
  if (upserts.length) {
    must(await supabase.from("acc_assets").upsert(upserts.map((x) => ({
      id: x.id, accountant_id: accId, client_ref: x.clientId ?? null, label: x.label,
      category: x.category, acquired_at: x.acquiredAt.slice(0, 10), cost: x.cost,
      rate_override: x.rateOverride ?? null,
    }))));
  }
  if (deletes.length) must(await supabase.from("acc_assets").delete().in("id", deletes));
};

/* ---------------- one-time import of existing browser data ---------------- */
const readLocal = <T,>(k: string, fallback: T): T => {
  try { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};

/**
 * Uploads this browser's legacy data to the database once per account. Skips when the account
 * already has clients in the database (another device imported first) or the flag is set.
 * Returns true when something was imported so the caller can reload its state.
 * Order matters: journal lines go in before period locks (locked periods reject inserts).
 */
export const importLocalBusinessData = async (accId: string): Promise<boolean> => {
  const flag = `mgmtk_biz_imported_${accId}`;
  try { if (localStorage.getItem(flag)) return false; } catch { return false; }

  const clients = readLocal<ClientRecord[]>("mgmtk_acc_clients", []);
  const employees = readLocal<Employee[]>("mgmtk_acc_employees", []);
  const bills = readLocal<BillInvoice[]>("mgmtk_acc_bills", []);
  const journal = readLocal<JournalLine[]>("mgmtk_acc_journal", []);
  const locks = readLocal<PeriodLock[]>("mgmtk_acc_period_locks", []);
  const precompte = readLocal<PrecompteMap>("mgmtk_acc_tva_precompte", {});
  const assets = readLocal<FixedAsset[]>("mgmtk_acc_assets", []);

  if (!clients.length && !employees.length && !bills.length && !journal.length && !assets.length) {
    localStorage.setItem(flag, "1");
    return false;
  }
  const { count, error } = await supabase.from("acc_clients").select("id", { count: "exact", head: true }).eq("accountant_id", accId);
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) { localStorage.setItem(flag, "1"); return false; }

  // Re-key non-uuid ids; keep journal source references pointing at the new bill ids.
  const billIds = new Map(bills.map((b) => [b.id, toUuid(b.id)]));
  const newBills = bills.map((b) => ({ ...b, id: billIds.get(b.id)! }));
  const newEmployees = employees.map((e) => ({ ...e, id: toUuid(e.id) }));
  const newAssets = assets.map((a) => ({ ...a, id: toUuid(a.id) }));
  const newJournal = journal.map((l) => ({
    ...l, id: toUuid(l.id), sourceRef: l.sourceRef && billIds.has(l.sourceRef) ? billIds.get(l.sourceRef) : l.sourceRef,
  }));

  await syncClients([], clients, accId);
  await syncEmployees([], newEmployees, accId);
  await syncBills([], newBills, accId);
  await syncJournal([], newJournal, accId);
  await syncLocks([], locks, accId);
  await syncPrecompte({}, precompte, accId);
  await syncAssets([], newAssets, accId);
  localStorage.setItem(flag, "1");
  return true;
};
