/**
 * Managementik Accounting Engine
 * ----------------------------------
 * Pure, deterministic functions that turn business events (sales invoice,
 * purchase invoice, payroll run, manual entry) into balanced double-entry
 * journal lines, then aggregate the journal into a Trial Balance, Bilan,
 * TCR (income statement) and a live G50 (Algerian monthly tax bundle).
 *
 * Period locking is enforced at this layer: once a tax declaration is
 * "validated" for a given period (YYYY-MM), no journal line tagged with
 * that period can be deleted or back-dated.
 */
import { classOf, getPcnByPrefix, PCN } from "./pcn";
import { SS_EMPLOYER_RATE } from "./payroll";
import { tapRateForPeriod, IBS_ACOMPTE_MONTHS, IBS_ACOMPTE_RATE, computeTvaSettlement } from "./algerianTax";

export type EntrySource = "manual" | "sales" | "purchase" | "payroll" | "tax";

export interface JournalLine {
  id: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** YYYY-MM — derived from date, denormalised so locks are O(1) */
  period: string;
  /** PCN account code (string) */
  account: string;
  label: string;
  debit: number;
  credit: number;
  clientId?: string;
  /** What generated this line */
  source: EntrySource;
  /** Group id — all lines posted together share the same batch id */
  batchId: string;
  /** Original document id (BillInvoice id, Employee+period, etc.) */
  sourceRef?: string;
  /** True once it belongs to a posted period — cannot be deleted */
  locked?: boolean;
}

/* ============================================================ */
/*                        POSTING ENGINE                        */
/* ============================================================ */

const ymOf = (date: string) => date.slice(0, 7);
const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

interface PostInput {
  date: string;
  clientId?: string;
  sourceRef?: string;
}

/**
 * Sales invoice double-entry:
 *   D 411  Clients              TTC
 *     C 70  Ventes               HT
 *     C 44551 TVA collectée      TVA
 */
export const postSalesInvoice = (
  inv: PostInput & { ht: number; tva: number; ttc: number; salesAccount?: string; party: string; number: string },
): JournalLine[] => {
  const batchId = newId();
  const period = ymOf(inv.date);
  const base = { date: inv.date, period, batchId, source: "sales" as const, clientId: inv.clientId, sourceRef: inv.sourceRef };
  const sales = inv.salesAccount || "70";
  const lines: JournalLine[] = [
    { ...base, id: newId(), account: "411", label: `Vente ${inv.number} — ${inv.party}`, debit: inv.ttc, credit: 0 },
    { ...base, id: newId(), account: sales, label: `Vente ${inv.number} — ${inv.party}`, debit: 0, credit: inv.ht },
  ];
  if (inv.tva > 0) {
    lines.push({ ...base, id: newId(), account: "44551", label: `TVA collectée ${inv.number}`, debit: 0, credit: inv.tva });
  }
  return lines;
};

/**
 * Purchase invoice double-entry:
 *   D 60  Achats                 HT
 *   D 44562 TVA déductible       TVA
 *     C 401 Fournisseurs         TTC
 */
export const postPurchaseInvoice = (
  inv: PostInput & { ht: number; tva: number; ttc: number; purchaseAccount?: string; party: string; number: string },
): JournalLine[] => {
  const batchId = newId();
  const period = ymOf(inv.date);
  const base = { date: inv.date, period, batchId, source: "purchase" as const, clientId: inv.clientId, sourceRef: inv.sourceRef };
  const purchase = inv.purchaseAccount || "60";
  const lines: JournalLine[] = [
    { ...base, id: newId(), account: purchase, label: `Achat ${inv.number} — ${inv.party}`, debit: inv.ht, credit: 0 },
  ];
  if (inv.tva > 0) {
    lines.push({ ...base, id: newId(), account: "44562", label: `TVA déductible ${inv.number}`, debit: inv.tva, credit: 0 });
  }
  lines.push({ ...base, id: newId(), account: "401", label: `Achat ${inv.number} — ${inv.party}`, debit: 0, credit: inv.ttc });
  return lines;
};

/**
 * Payroll posting (per employee, per month):
 *   D 631  Rémunérations           Gross
 *   D 6451 CNAS part patronale     25,5% Gross (employer)
 *     C 421  Personnel rémun. dues  Net
 *     C 431  CNAS                   9% Gross + 25,5% Gross
 *     C 4422 IRG/Salaires           IRG
 */
export const postPayrollRun = (run: PostInput & {
  employeeId: string; employeeName: string;
  gross: number; ssEmployee: number; irg: number; net: number;
  hasCacobatph?: boolean;
}): JournalLine[] => {
  const batchId = newId();
  const period = ymOf(run.date);
  const base = { date: run.date, period, batchId, source: "payroll" as const, clientId: run.clientId, sourceRef: run.sourceRef ?? run.employeeId };
  const ssEmployer = Math.round(run.gross * SS_EMPLOYER_RATE); // employer CNAS share
  const sociauxAcc = run.hasCacobatph ? "432" : "431";
  return [
    { ...base, id: newId(), account: "631", label: `Salaire brut — ${run.employeeName}`, debit: run.gross, credit: 0 },
    { ...base, id: newId(), account: "6451", label: `CNAS patronale — ${run.employeeName}`, debit: ssEmployer, credit: 0 },
    { ...base, id: newId(), account: "421", label: `Net à payer — ${run.employeeName}`, debit: 0, credit: run.net },
    { ...base, id: newId(), account: sociauxAcc, label: `Cotisations sociales — ${run.employeeName}`, debit: 0, credit: run.ssEmployee + ssEmployer },
    ...(run.irg > 0 ? [{ ...base, id: newId(), account: "4422", label: `IRG retenu — ${run.employeeName}`, debit: 0, credit: run.irg }] : []),
  ];
};

/* ============================================================ */
/*                       AGGREGATIONS                           */
/* ============================================================ */

export interface TrialRow {
  account: string;
  label: string;
  class: number;
  debit: number;
  credit: number;
  balance: number; // debit - credit (positive = debit balance)
}

const labelOf = (code: string) => getPcnByPrefix(code)?.label ?? code;

/** Trial balance grouped by exact account code. */
export const computeTrialBalance = (
  lines: JournalLine[],
  filter?: { clientId?: string; from?: string; to?: string },
): TrialRow[] => {
  const f = filter ?? {};
  const acc = new Map<string, TrialRow>();
  for (const l of lines) {
    if (f.clientId && l.clientId !== f.clientId) continue;
    if (f.from && l.date < f.from) continue;
    if (f.to && l.date > f.to) continue;
    const key = l.account;
    const cur =
      acc.get(key) ??
      { account: key, label: labelOf(key), class: classOf(key) ?? 0, debit: 0, credit: 0, balance: 0 };
    cur.debit += l.debit;
    cur.credit += l.credit;
    cur.balance = cur.debit - cur.credit;
    acc.set(key, cur);
  }
  return Array.from(acc.values()).sort((a, b) => a.account.localeCompare(b.account));
};

/** Bilan = balance sheet snapshot. */
export interface Bilan {
  actif: TrialRow[];
  passif: TrialRow[];
  totalActif: number;
  totalPassif: number;
  result: number; // P&L closing — positive = profit
}

export const computeBilan = (lines: JournalLine[], filter?: { clientId?: string; to?: string }): Bilan => {
  const trial = computeTrialBalance(lines, filter);
  const actif: TrialRow[] = [];
  const passif: TrialRow[] = [];
  let produits = 0, charges = 0;
  for (const r of trial) {
    if (r.class === 7) { produits += r.credit - r.debit; continue; }
    if (r.class === 6) { charges += r.debit - r.credit; continue; }
    const stmt = getPcnByPrefix(r.account)?.statement;
    if (stmt === "BILAN_ACTIF") actif.push(r);
    else if (stmt === "BILAN_PASSIF") passif.push(r);
    else if (r.balance >= 0) actif.push(r);
    else passif.push(r);
  }
  const result = produits - charges;
  // Push the result of the period into the passif so the bilan balances.
  if (result !== 0) {
    passif.push({
      account: result >= 0 ? "120" : "129",
      label: result >= 0 ? "Résultat de l'exercice (bénéfice)" : "Résultat de l'exercice (perte)",
      class: 1, debit: 0, credit: Math.abs(result), balance: -Math.abs(result),
    });
  }
  const totalActif = actif.reduce((s, r) => s + Math.max(0, r.balance), 0);
  const totalPassif = passif.reduce((s, r) => s + Math.max(0, -r.balance) + (r.account === "120" || r.account === "129" ? Math.abs(result) : 0), 0);
  return { actif, passif, totalActif, totalPassif, result };
};

/** TCR — Tableau des Comptes de Résultats (Income Statement). */
export interface TCR {
  produits: TrialRow[];
  charges: TrialRow[];
  totalProduits: number;
  totalCharges: number;
  result: number;
}

export const computeTCR = (lines: JournalLine[], filter?: { clientId?: string; from?: string; to?: string }): TCR => {
  const trial = computeTrialBalance(lines, filter);
  const produits = trial.filter((r) => r.class === 7);
  const charges = trial.filter((r) => r.class === 6);
  const totalProduits = produits.reduce((s, r) => s + (r.credit - r.debit), 0);
  const totalCharges = charges.reduce((s, r) => s + (r.debit - r.credit), 0);
  return { produits, charges, totalProduits, totalCharges, result: totalProduits - totalCharges };
};

/* ============================================================ */
/*                          G50 ENGINE                          */
/* ============================================================ */

export interface G50Computation {
  period: string; // YYYY-MM
  caHt: number;       // class 7 net credit movements
  tvaCollected: number; // 44551 credit movements
  tvaDeductible: number; // 44562 debit movements
  tvaDue: number;
  /** TVA credit brought forward from the previous month (précompte). */
  precompteFromPrev: number;
  /** TVA credit to carry to the next month. */
  precompteToNext: number;
  salaries: number;   // 631 debit movements
  irgSalaries: number; // 4422 credit movements
  tapRate: number; tap: number;
  ibsRate: number; ibs: number;
  total: number;
}

const sumMovementsBetween = (
  lines: JournalLine[],
  predicate: (l: JournalLine) => boolean,
  side: "debit" | "credit",
  from: string,
  to: string,
  clientId?: string,
) =>
  lines
    .filter((l) => l.date >= from && l.date <= to)
    .filter((l) => (clientId ? l.clientId === clientId : true))
    .filter(predicate)
    .reduce((s, l) => s + l[side], 0);

/** Compute the G50 of one client for one month, live from the journal. */
export const computeG50FromJournal = (
  lines: JournalLine[],
  opts: {
    clientId?: string; period: string; tapRate?: number;
    /** IBS due for the previous financial year; drives the acomptes. */
    ibsPriorYear?: number;
    /** TVA credit (précompte) carried from the previous month. */
    precompteFromPrev?: number;
  },
): G50Computation => {
  const period = opts.period;
  const from = `${period}-01`;
  const to = `${period}-31`;
  const tapRate = opts.tapRate ?? tapRateForPeriod(period);
  const ibsRate = IBS_ACOMPTE_RATE;

  const isClass = (code: string, c: number) => classOf(code) === c;
  const caHtCredit = sumMovementsBetween(lines, (l) => isClass(l.account, 7), "credit", from, to, opts.clientId);
  const caHtDebit  = sumMovementsBetween(lines, (l) => isClass(l.account, 7), "debit",  from, to, opts.clientId);
  const caHt = Math.max(0, caHtCredit - caHtDebit);

  const tvaCollected   = sumMovementsBetween(lines, (l) => l.account === "44551", "credit", from, to, opts.clientId);
  const tvaDeductible  = sumMovementsBetween(lines, (l) => l.account === "44562", "debit",  from, to, opts.clientId);
  const tvaSettlement = computeTvaSettlement({
    period, tvaCollected, tvaDeductible, precompteFromPrev: opts.precompteFromPrev,
  });
  const tvaDue = tvaSettlement.tvaDue;

  const salaries     = sumMovementsBetween(lines, (l) => l.account === "631", "debit",  from, to, opts.clientId);
  const irgSalaries  = sumMovementsBetween(lines, (l) => l.account === "4422", "credit", from, to, opts.clientId);

  const tap = Math.round((caHt * tapRate) / 100);
  // IBS acomptes are 30 % of the previous year's IBS, due in March, June and
  // November only (CIDTA art. 356); other months carry no IBS line.
  const month = Number(period.slice(5, 7));
  const ibs = IBS_ACOMPTE_MONTHS.includes(month)
    ? Math.max(0, Math.round(((opts.ibsPriorYear ?? 0) * ibsRate) / 100))
    : 0;

  return {
    period, caHt, tvaCollected, tvaDeductible, tvaDue,
    precompteFromPrev: tvaSettlement.precompteFromPrev, precompteToNext: tvaSettlement.precompteToNext,
    salaries, irgSalaries,
    tapRate, tap, ibsRate, ibs,
    total: tap + tvaDue + irgSalaries + ibs,
  };
};

/* ============================================================ */
/*                       PERIOD LOCKING                         */
/* ============================================================ */

export interface PeriodLock {
  /** clientId__YYYY-MM */
  key: string;
  clientId?: string;
  period: string;
  validatedAt: string;
  reference: string; // declaration id (G50 etc.)
}

export const lockKey = (period: string, clientId?: string) =>
  `${clientId ?? "_"}__${period}`;

export const isLineLocked = (line: JournalLine, locks: PeriodLock[]): boolean =>
  locks.some((l) => l.key === lockKey(line.period, line.clientId));

/** Validation entry-point — call when a G50 declaration is filed. */
export const lockPeriod = (
  locks: PeriodLock[],
  opts: { clientId?: string; period: string; reference: string },
): PeriodLock[] => {
  const key = lockKey(opts.period, opts.clientId);
  if (locks.some((l) => l.key === key)) return locks;
  return [
    ...locks,
    { key, clientId: opts.clientId, period: opts.period, validatedAt: new Date().toISOString(), reference: opts.reference },
  ];
};

/* ============================================================ */
/*                         SUMMARY                              */
/* ============================================================ */

export const PCN_TOTAL = PCN.length;
