// What goes in each variable cell of the G50 form. Pure functions, no I/O, so Vitest can cover them.
// Slot ids are "<sheet>!<cell>" and match assets/layout.ts. The arithmetic mirrors the formulas in
// public/templates/G50_template.xlsx (T.V.A on the taxable turnover, carried to RECAP). The G50 dialog in the app imports
// g50Amounts from here, so the total it shows is the total printed on the form.

export interface G50Input {
  companyName: string;
  activity?: string;
  address?: string;
  month?: string;
  trimestre?: string;
  year?: string;
  direction?: string;
  commune?: string;
  nif?: string;
  bp?: string;
  caHtTotal: number;
  caHtImposable: number;
  // The other bases and rates of the G50 dialog. Absent (an older client): no amount, VAT at 19%.
  salaries?: number;
  benefice?: number;
  rTap?: number;
  rTva?: number;
  rIrg?: number;
  rIbs?: number;
}

/** VAT rates the official form has a row for (0 = exempt, printed on the 19% row with no amount). */
export const G50_VAT_RATES = [0, 9, 19];

const TEXT_MAX = 200;

const isControl = (ch: string) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127;
const cleanText = (v: unknown): string =>
  typeof v === "string" ? [...v].map((ch) => (isControl(ch) ? " " : ch)).join("").replace(/\s+/g, " ").trim().slice(0, TEXT_MAX) : "";

const cleanNumber = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e13 ? v : 0);
const cleanRate = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : fallback);

/** Returns null when the body is not a G50 input. Unknown fields are dropped. */
export function parseG50Input(raw: unknown): G50Input | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const companyName = cleanText(r.companyName);
  if (!companyName) return null;
  return {
    companyName,
    activity: cleanText(r.activity),
    address: cleanText(r.address),
    month: /^(0[1-9]|1[0-2])$/.test(String(r.month ?? "")) ? String(r.month) : "",
    trimestre: /^[1-4]$/.test(String(r.trimestre ?? "")) ? String(r.trimestre) : "",
    year: /^\d{4}$/.test(String(r.year ?? "")) ? String(r.year) : "",
    direction: cleanText(r.direction),
    commune: cleanText(r.commune),
    nif: cleanText(r.nif),
    bp: cleanText(r.bp),
    caHtTotal: cleanNumber(r.caHtTotal),
    caHtImposable: cleanNumber(r.caHtImposable),
    salaries: cleanNumber(r.salaries),
    benefice: cleanNumber(r.benefice),
    rTap: cleanRate(r.rTap, 0),
    rTva: cleanRate(r.rTva, 19),
    rIrg: cleanRate(r.rIrg, 0),
    rIbs: cleanRate(r.rIbs, 0),
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The amounts the G50 dialog adds up: VAT on the taxable turnover, TAP on the total turnover, IRG on salaries and IBS
 * on the taxable profit, each to the centime, and their sum.
 */
export function g50Amounts(i: Pick<G50Input, "caHtTotal" | "caHtImposable" | "salaries" | "benefice" | "rTap" | "rTva" | "rIrg" | "rIbs">) {
  const tva = r2(i.caHtImposable * ((i.rTva ?? 19) / 100));
  const tap = r2(i.caHtTotal * ((i.rTap ?? 0) / 100));
  const irg = r2((i.salaries ?? 0) * ((i.rIrg ?? 0) / 100));
  const ibs = r2((i.benefice ?? 0) * ((i.rIbs ?? 0) / 100));
  return { tva, tap, irg, ibs, total: r2(tva + tap + irg + ibs) };
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Excel "#,##0": rounded to whole units, 0 shown as "0". */
export const fmtInt = (v: number) => group(String(Math.round(v)));

/** Excel accounting format: "-" for zero. */
export function fmtAccounting(v: number, decimals: 0 | 2): string {
  if (v === 0) return "-"; // only an exact zero; 0.1 in a whole-unit cell shows "0"
  const scaled = Math.round(v * 10 ** decimals);
  const s = String(scaled).padStart(decimals + 1, "0");
  const whole = group(decimals ? s.slice(0, -decimals) : s);
  return decimals ? `${whole}.${s.slice(-decimals)}` : whole;
}

/** dd/mm/yyyy in Algeria's time zone. */
export function algiersDate(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
}

export function computeSlots(input: G50Input, now: Date): Record<string, string> {
  const S: Record<string, string> = {};
  const id = (a: string, v?: string) => { if (v) S[`IBS-IRG!${a}`] = v; };
  id("AK14", input.companyName);
  id("AS20", input.activity);
  id("AN22", input.address);
  id("Y6", input.month);
  id("Y7", input.trimestre);
  id("Y9", input.year);
  id("I7", input.direction);
  id("H16", input.commune);
  const nif = (input.nif ?? "").replace(/\D/g, "").slice(0, 15);
  [..."DEFGHIJKLMNOPQR"].forEach((c, i) => id(`${c}22`, nif[i]));
  S["IBS-IRG!BW23"] = input.bp ? `BP : ${input.bp}` : "BP :";

  const { tva, tap, irg, ibs, total } = g50Amounts(input);

  // VAT: the 19% row ("Autres prestations de services"), or at 9% the "Prestations de services (art. 23)" row.
  const at9 = input.rTva === 9;
  const row = at9 ? 11 : 22;
  if (input.caHtTotal > 0) S[`T.V.A!AQ${row}`] = fmtInt(input.caHtTotal);
  if (input.caHtImposable > 0) S[`T.V.A!BQ${row}`] = fmtInt(input.caHtImposable);
  S["T.V.A!CH22"] = fmtAccounting(at9 ? 0 : tva, 2);
  S["T.V.A!CH11"] = fmtAccounting(at9 ? tva : 0, 2);
  S["T.V.A!CH31"] = fmtInt(tva);
  S["T.V.A!CD35"] = fmtAccounting(tva, 2);
  S["T.V.A!CD40"] = fmtAccounting(tva, 2);
  S["T.V.A!CD42"] = fmtAccounting(tva, 2);

  // IBS: "Acompte provisionnel IBS", block 1. IRG on salaries: block 4, the base and the amount (its rate cell says "Barème").
  if (ibs > 0) S["IBS-IRG!BX30"] = fmtAccounting(ibs, 0);
  S["IBS-IRG!BX34"] = fmtAccounting(ibs, 0);
  if (irg > 0) {
    S["IBS-IRG!AY50"] = fmtInt(input.salaries ?? 0);
    S["IBS-IRG!BX50"] = fmtAccounting(irg, 0);
  }
  S["IBS-IRG!BX56"] = fmtAccounting(irg, 0);

  // TAP (repealed from 2024; the dialog still accepts a rate for earlier periods): "Autres impots et taxes", block 7.
  S["D.TIMBRE!BL15"] = tap > 0 ? `${input.rTap ?? 0}%` : "%";
  if (tap > 0) {
    S["D.TIMBRE!H15"] = "TAP";
    S["D.TIMBRE!AS15"] = fmtInt(input.caHtTotal);
    S["D.TIMBRE!BP15"] = fmtAccounting(tap, 2);
  }
  S["D.TIMBRE!BP21"] = fmtAccounting(tap, 2);

  // Recapitulation: lines 1 (IBS), 4 (IRG), 7 (Autres), 8 (TVA), and the total to pay.
  S["RECAP!Y27"] = fmtAccounting(ibs, 0);
  S["RECAP!Y31"] = fmtAccounting(irg, 0);
  S["RECAP!Y34"] = fmtAccounting(tap, 0);
  S["RECAP!Y35"] = fmtAccounting(tva, 0);
  S["RECAP!Y39"] = fmtAccounting(total, 0);
  const date = algiersDate(now);
  S["RECAP!AT31"] = date;
  S["RECAP!BK34"] = date;
  return S;
}
