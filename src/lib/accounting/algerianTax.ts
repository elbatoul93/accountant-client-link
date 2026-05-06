/**
 * Algerian Tax Intelligence (LF 2024 — simplified, demo-grade)
 * ------------------------------------------------------------
 * Pure helpers:
 *   - IBS rates by activity sector + Acomptes Provisionnels (30% of N-1)
 *   - IRG progressive scale (Professions Libérales, annual)
 *   - TFP (1%) and TAPP (1%) from gross salary mass — with workforce rule
 *   - TRWI fixed annual fee (1000 DA / 500 DA)
 *   - Build a G50 summary line array ready for the official-form preview
 */

/* ===================== IBS ===================== */

export type IbsSector = "PRODUCTION" | "BTPH" | "SERVICES";

export const IBS_RATES: Record<IbsSector, number> = {
  PRODUCTION: 19,
  BTPH: 23,
  SERVICES: 26,
};

/** Compute one IBS quarterly instalment = 30% × IBS N-1. */
export const computeIbsAcompte = (
  ibsPriorYear: number,
): { perAcompte: number; totalThreeAcomptes: number } => {
  const perAcompte = Math.max(0, Math.round((ibsPriorYear * 30) / 100));
  return { perAcompte, totalThreeAcomptes: perAcompte * 3 };
};

/** Compute IBS for the year given taxable result and sector. */
export const computeIbs = (
  taxableResult: number,
  sector: IbsSector,
): { rate: number; ibs: number } => {
  const rate = IBS_RATES[sector];
  return { rate, ibs: Math.max(0, Math.round((taxableResult * rate) / 100)) };
};

/* ===================== IRG (Professions Libérales — annual) ===================== */

export interface IrgBracket {
  upTo: number;
  rate: number; // %
  label: string;
}

export const IRG_PRO_BRACKETS_2024: IrgBracket[] = [
  { upTo: 240_000,    rate: 0,  label: "0 – 240 000" },
  { upTo: 480_000,    rate: 23, label: "240 001 – 480 000" },
  { upTo: 960_000,    rate: 27, label: "480 001 – 960 000" },
  { upTo: 1_920_000,  rate: 30, label: "960 001 – 1 920 000" },
  { upTo: 3_840_000,  rate: 33, label: "1 920 001 – 3 840 000" },
  { upTo: Infinity,   rate: 35, label: "Au-delà de 3 840 000" },
];

export interface IrgComputation {
  taxable: number;
  total: number;
  effectiveRate: number; // %
  detail: { bracket: IrgBracket; slice: number; amount: number }[];
}

export const computeIrgProfessionsLiberales = (
  taxableAnnual: number,
): IrgComputation => {
  const detail: IrgComputation["detail"] = [];
  let prev = 0;
  let total = 0;
  for (const b of IRG_PRO_BRACKETS_2024) {
    const slice = Math.max(0, Math.min(taxableAnnual, b.upTo) - prev);
    if (slice > 0) {
      const amount = (slice * b.rate) / 100;
      total += amount;
      detail.push({ bracket: b, slice, amount: Math.round(amount) });
    }
    prev = b.upTo;
    if (taxableAnnual <= b.upTo) break;
  }
  total = Math.round(total);
  const effectiveRate = taxableAnnual > 0 ? +((total / taxableAnnual) * 100).toFixed(2) : 0;
  return { taxable: taxableAnnual, total, effectiveRate, detail };
};

/* ===================== TFP & TAPP ===================== */

export interface TfpTappInput {
  grossMass: number;          // total gross salaries for the period
  employeeCount: number;
  formationExpenses?: number; // deductible from TFP (capped at TFP due)
}

export interface TfpTappResult {
  grossMass: number;
  employeeCount: number;
  tfpRate: number;     // 0 if < 20 employees
  tfpGross: number;
  tfpDeduction: number;
  tfpDue: number;
  tappRate: number;    // always 1
  tapp: number;
  total: number;
  threshold: number;   // 20
  thresholdMet: boolean;
}

export const TFP_TAPP_THRESHOLD = 20;

export const computeTfpTapp = (input: TfpTappInput): TfpTappResult => {
  const thresholdMet = input.employeeCount >= TFP_TAPP_THRESHOLD;
  const tfpRate = thresholdMet ? 1 : 0;
  const tappRate = 1;
  const tfpGross = Math.round((input.grossMass * tfpRate) / 100);
  const tapp = Math.round((input.grossMass * tappRate) / 100);
  const tfpDeduction = Math.min(tfpGross, Math.max(0, Math.round(input.formationExpenses ?? 0)));
  const tfpDue = Math.max(0, tfpGross - tfpDeduction);
  return {
    grossMass: input.grossMass,
    employeeCount: input.employeeCount,
    tfpRate, tfpGross, tfpDeduction, tfpDue,
    tappRate, tapp,
    total: tfpDue + tapp,
    threshold: TFP_TAPP_THRESHOLD,
    thresholdMet,
  };
};

/* ===================== TRWI (Taxe Radio/TV — fixed annual) ===================== */

export type LegalEntityKind = "PP" | "PM"; // Personne Physique / Morale

export const TRWI_FEES: Record<LegalEntityKind, number> = {
  PP: 500,
  PM: 1000,
};

export const computeTrwi = (kind: LegalEntityKind): number => TRWI_FEES[kind];

/* ===================== TAP / TVA constants ===================== */

/** Official Algerian TAP rate — 1% of monthly turnover (LF 2024). */
export const TAP_RATE = 1;

/** Standard Algerian VAT rates. */
export const TVA_RATES = [0, 9, 19] as const;
export type TvaRate = typeof TVA_RATES[number];

/* ===================== TVA / Précompte engine ===================== */

export interface TvaPeriodInput {
  period: string;            // YYYY-MM
  tvaCollected: number;      // 44551 credits (sales)
  tvaDeductible: number;     // 44562 debits (purchases)
  /** Précompte carried forward from the prior month (credit balance). */
  precompteFromPrev?: number;
}

export interface TvaPeriodResult {
  period: string;
  tvaCollected: number;
  tvaDeductible: number;
  precompteFromPrev: number;
  /** Total TVA available to deduct = deductible + précompte N-1 */
  totalDeductible: number;
  /** Net TVA payable this month (zero if a credit remains). */
  tvaDue: number;
  /** Précompte (credit) carried forward to next month. */
  precompteToNext: number;
  hasPrecompte: boolean;
}

/**
 * Compute the monthly VAT settlement, automatically rolling a Précompte
 * (credit balance) into the next month when input VAT > output VAT.
 */
export const computeTvaSettlement = (input: TvaPeriodInput): TvaPeriodResult => {
  const prev = Math.max(0, Math.round(input.precompteFromPrev ?? 0));
  const totalDeductible = Math.round(input.tvaDeductible + prev);
  const balance = Math.round(input.tvaCollected - totalDeductible);
  const tvaDue = balance > 0 ? balance : 0;
  const precompteToNext = balance < 0 ? -balance : 0;
  return {
    period: input.period,
    tvaCollected: Math.round(input.tvaCollected),
    tvaDeductible: Math.round(input.tvaDeductible),
    precompteFromPrev: prev,
    totalDeductible,
    tvaDue,
    precompteToNext,
    hasPrecompte: precompteToNext > 0,
  };
};

/* ===================== État 104 — Liste des Fournisseurs ===================== */

export interface Etat104InvoiceLike {
  number: string;
  date: string;
  party: string;       // supplier name
  partyTaxId?: string; // NIF
  ht: number;
  tva: number;
  ttc: number;
  kind: "purchase" | "sales";
}

export interface Etat104Row {
  supplier: string;
  nif: string;
  invoices: Array<{ number: string; date: string; ht: number; tva: number; ttc: number }>;
  totalHt: number;
  totalTva: number;
  totalTtc: number;
}

export interface Etat104 {
  rows: Etat104Row[];
  grandHt: number;
  grandTva: number;
  grandTtc: number;
}

/** Build an "État 104 — كشف الموردين" from purchase invoices. */
export const buildEtat104 = (
  invoices: Etat104InvoiceLike[],
  filter?: { from?: string; to?: string },
): Etat104 => {
  const groups = new Map<string, Etat104Row>();
  for (const inv of invoices) {
    if (inv.kind !== "purchase") continue;
    if (filter?.from && inv.date < filter.from) continue;
    if (filter?.to && inv.date > filter.to) continue;
    const key = `${(inv.partyTaxId || "").trim()}__${inv.party.trim().toLowerCase()}`;
    const cur = groups.get(key) ?? {
      supplier: inv.party,
      nif: inv.partyTaxId || "—",
      invoices: [],
      totalHt: 0, totalTva: 0, totalTtc: 0,
    };
    cur.invoices.push({ number: inv.number, date: inv.date, ht: inv.ht, tva: inv.tva, ttc: inv.ttc });
    cur.totalHt += inv.ht;
    cur.totalTva += inv.tva;
    cur.totalTtc += inv.ttc;
    groups.set(key, cur);
  }
  const rows = Array.from(groups.values()).sort((a, b) => b.totalTtc - a.totalTtc);
  const grandHt = rows.reduce((s, r) => s + r.totalHt, 0);
  const grandTva = rows.reduce((s, r) => s + r.totalTva, 0);
  const grandTtc = rows.reduce((s, r) => s + r.totalTtc, 0);
  return { rows, grandHt, grandTva, grandTtc };
};

export type G50Section = "A" | "B" | "C" | "D";

export interface G50Line {
  /** Official article / section ref shown on the form */
  code: string;
  label: string;
  base?: number;
  rate?: number;
  amount: number;
  group: "TVA" | "TAP" | "IRG" | "IBS" | "TFP" | "TAPP" | "AUTRES";
  /** Official G50 section: A turnover/TAP, B TVA, C withholding, D other */
  section: G50Section;
  /** Marker for informational rows (Précompte) — not summed in total */
  informational?: boolean;
}

export interface G50PreviewInput {
  period: string;          // YYYY-MM
  caHt: number;
  tvaCollected: number;
  tvaDeductible: number;
  /** Précompte (TVA credit) carried forward from prior month. */
  precompteFromPrev?: number;
  tapRate?: number;        // default 1 (LF 2024)
  irgSalaries: number;
  ibsAcompte?: number;     // monthly share of quarterly acompte
  tfpTapp?: TfpTappResult;
  trwi?: number;           // can be displayed once (1/12 monthly or annual lump)
}

export interface G50Preview {
  period: string;
  lines: G50Line[];
  total: number;
  /** TVA settlement detail (used by the UI to render Précompte row) */
  tva: TvaPeriodResult;
  sections: {
    A: { title: string; lines: G50Line[]; subtotal: number };
    B: { title: string; lines: G50Line[]; subtotal: number };
    C: { title: string; lines: G50Line[]; subtotal: number };
    D: { title: string; lines: G50Line[]; subtotal: number };
  };
}

export const buildG50Preview = (input: G50PreviewInput): G50Preview => {
  const tapRate = input.tapRate ?? TAP_RATE;
  const tva = computeTvaSettlement({
    period: input.period,
    tvaCollected: input.tvaCollected,
    tvaDeductible: input.tvaDeductible,
    precompteFromPrev: input.precompteFromPrev,
  });
  const tap = Math.round((input.caHt * tapRate) / 100);

  const lines: G50Line[] = [];

  /* Section A — Chiffre d'Affaires & TAP */
  lines.push({
    code: "A-CA",
    label: "Chiffre d'affaires HT",
    base: input.caHt,
    amount: 0,
    group: "TAP",
    section: "A",
    informational: true,
  });
  lines.push({
    code: "A-TAP",
    label: "TAP — Taxe sur l'Activité Professionnelle",
    base: input.caHt,
    rate: tapRate,
    amount: tap,
    group: "TAP",
    section: "A",
  });

  /* Section B — TVA (Sales / Purchases / Précompte) */
  lines.push({
    code: "B-TVA-COL",
    label: "TVA collectée (sur ventes)",
    base: input.caHt,
    amount: tva.tvaCollected,
    group: "TVA",
    section: "B",
    informational: true,
  });
  lines.push({
    code: "B-TVA-DED",
    label: "TVA déductible (sur achats)",
    amount: tva.tvaDeductible,
    group: "TVA",
    section: "B",
    informational: true,
  });
  if (tva.precompteFromPrev > 0) {
    lines.push({
      code: "B-PRECOMPTE-N1",
      label: "Précompte reporté du mois précédent (رصيد دائن سابق)",
      amount: tva.precompteFromPrev,
      group: "TVA",
      section: "B",
      informational: true,
    });
  }
  lines.push({
    code: "B-TVA-DUE",
    label: tva.hasPrecompte ? "TVA — Crédit (rien à payer)" : "TVA — Net à payer",
    amount: tva.tvaDue,
    group: "TVA",
    section: "B",
  });
  if (tva.precompteToNext > 0) {
    lines.push({
      code: "B-PRECOMPTE-N",
      label: "Précompte à reporter au mois suivant (رصيد دائن للترحيل)",
      amount: tva.precompteToNext,
      group: "TVA",
      section: "B",
      informational: true,
    });
  }

  /* Section C — Retenues à la source (IRG/Salaires) */
  lines.push({
    code: "C-IRG-SAL",
    label: "IRG — Retenue sur Salaires",
    base: input.irgSalaries,
    amount: input.irgSalaries,
    group: "IRG",
    section: "C",
  });

  /* Section D — Autres (IBS Acompte, TFP/TAPP, TRWI) */
  if (input.ibsAcompte && input.ibsAcompte > 0) {
    lines.push({
      code: "D-IBS-ACPT",
      label: "IBS — Acompte Provisionnel",
      amount: Math.round(input.ibsAcompte),
      group: "IBS",
      section: "D",
    });
  }
  if (input.tfpTapp) {
    if (input.tfpTapp.tfpDue > 0) {
      lines.push({
        code: "D-TFP",
        label: `TFP (${input.tfpTapp.tfpRate}%)`,
        base: input.tfpTapp.grossMass,
        rate: input.tfpTapp.tfpRate,
        amount: input.tfpTapp.tfpDue,
        group: "TFP",
        section: "D",
      });
    }
    lines.push({
      code: "D-TAPP",
      label: `TAPP (${input.tfpTapp.tappRate}%)`,
      base: input.tfpTapp.grossMass,
      rate: input.tfpTapp.tappRate,
      amount: input.tfpTapp.tapp,
      group: "TAPP",
      section: "D",
    });
  }
  // TRWI removed from G50 per regulatory update.

  const total = lines
    .filter((l) => !l.informational)
    .reduce((s, l) => s + l.amount, 0);

  const groupBy = (s: G50Section, title: string) => {
    const ls = lines.filter((l) => l.section === s);
    const subtotal = ls.filter((l) => !l.informational).reduce((sum, l) => sum + l.amount, 0);
    return { title, lines: ls, subtotal };
  };

  return {
    period: input.period,
    lines,
    total,
    tva,
    sections: {
      A: groupBy("A", "Section A — Chiffre d'Affaires & TAP"),
      B: groupBy("B", "Section B — Taxe sur la Valeur Ajoutée (TVA)"),
      C: groupBy("C", "Section C — Retenues à la source"),
      D: groupBy("D", "Section D — Autres taxes"),
    },
  };
};
