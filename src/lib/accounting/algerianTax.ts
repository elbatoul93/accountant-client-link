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

/* ===================== G50 Summary Builder ===================== */

export interface G50Line {
  /** Official article / section ref shown on the form */
  code: string;
  label: string;
  base?: number;
  rate?: number;
  amount: number;
  group: "TVA" | "TAP" | "IRG" | "IBS" | "TFP" | "TAPP" | "AUTRES";
}

export interface G50PreviewInput {
  period: string;          // YYYY-MM
  caHt: number;
  tvaCollected: number;
  tvaDeductible: number;
  tapRate?: number;        // default 2
  irgSalaries: number;
  ibsAcompte?: number;     // monthly share of quarterly acompte
  tfpTapp?: TfpTappResult;
  trwi?: number;           // can be displayed once (1/12 monthly or annual lump)
}

export interface G50Preview {
  period: string;
  lines: G50Line[];
  total: number;
}

export const buildG50Preview = (input: G50PreviewInput): G50Preview => {
  const tapRate = input.tapRate ?? 2;
  const tvaDue = Math.max(0, input.tvaCollected - input.tvaDeductible);
  const tap = Math.round((input.caHt * tapRate) / 100);

  const lines: G50Line[] = [
    {
      code: "G50-TVA",
      label: "TVA — Taxe sur la Valeur Ajoutée",
      base: input.tvaCollected - input.tvaDeductible,
      amount: tvaDue,
      group: "TVA",
    },
    {
      code: "G50-TAP",
      label: "TAP — Taxe sur l'Activité Professionnelle",
      base: input.caHt,
      rate: tapRate,
      amount: tap,
      group: "TAP",
    },
    {
      code: "G50-IRG/SAL",
      label: "IRG — Retenue sur Salaires",
      base: input.irgSalaries,
      amount: input.irgSalaries,
      group: "IRG",
    },
  ];

  if (input.ibsAcompte && input.ibsAcompte > 0) {
    lines.push({
      code: "G50-IBS-ACPT",
      label: "IBS — Acompte Provisionnel",
      amount: Math.round(input.ibsAcompte),
      group: "IBS",
    });
  }

  if (input.tfpTapp) {
    if (input.tfpTapp.tfpDue > 0) {
      lines.push({
        code: "G50-TFP",
        label: `TFP — Taxe de Formation Professionnelle (${input.tfpTapp.tfpRate}%)`,
        base: input.tfpTapp.grossMass,
        rate: input.tfpTapp.tfpRate,
        amount: input.tfpTapp.tfpDue,
        group: "TFP",
      });
    }
    lines.push({
      code: "G50-TAPP",
      label: `TAPP — Taxe d'Apprentissage (${input.tfpTapp.tappRate}%)`,
      base: input.tfpTapp.grossMass,
      rate: input.tfpTapp.tappRate,
      amount: input.tfpTapp.tapp,
      group: "TAPP",
    });
  }

  if (input.trwi && input.trwi > 0) {
    lines.push({
      code: "G50-TRWI",
      label: "TRWI — Redevance Radio / Télévision",
      amount: Math.round(input.trwi),
      group: "AUTRES",
    });
  }

  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { period: input.period, lines, total };
};
