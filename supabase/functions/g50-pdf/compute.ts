// What goes in each variable cell of the G50 form. Pure functions, no I/O, so Vitest can cover them.
// Slot ids are "<sheet>!<cell>" and match assets/layout.ts. The arithmetic mirrors the formulas in
// public/templates/G50_template.xlsx (T.V.A 19% on the taxable turnover, carried to RECAP).

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
}

const TEXT_MAX = 200;

const isControl = (ch: string) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127;
const cleanText = (v: unknown): string =>
  typeof v === "string" ? [...v].map((ch) => (isControl(ch) ? " " : ch)).join("").replace(/\s+/g, " ").trim().slice(0, TEXT_MAX) : "";

const cleanNumber = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e13 ? v : 0);

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
  };
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
  const ibs = (a: string, v?: string) => { if (v) S[`IBS-IRG!${a}`] = v; };
  ibs("AK14", input.companyName);
  ibs("AS20", input.activity);
  ibs("AN22", input.address);
  ibs("Y6", input.month);
  ibs("Y7", input.trimestre);
  ibs("Y9", input.year);
  ibs("I7", input.direction);
  ibs("H16", input.commune);
  const nif = (input.nif ?? "").replace(/\D/g, "").slice(0, 15);
  [..."DEFGHIJKLMNOPQR"].forEach((c, i) => ibs(`${c}22`, nif[i]));
  S["IBS-IRG!BW23"] = input.bp ? `BP : ${input.bp}` : "BP :";

  if (input.caHtTotal > 0) S["T.V.A!AQ22"] = fmtInt(input.caHtTotal);
  if (input.caHtImposable > 0) S["T.V.A!BQ22"] = fmtInt(input.caHtImposable);
  const tva = Math.round(input.caHtImposable * 0.19 * 100) / 100; // CH22, 19% bracket
  S["T.V.A!CH22"] = fmtAccounting(tva, 2);
  S["T.V.A!CH31"] = fmtInt(tva);
  S["T.V.A!CD35"] = fmtAccounting(tva, 2);
  S["T.V.A!CD40"] = fmtAccounting(tva, 2);
  S["T.V.A!CD42"] = fmtAccounting(tva, 2);
  S["RECAP!Y35"] = fmtAccounting(tva, 0);
  S["RECAP!Y39"] = fmtAccounting(tva, 0);
  const date = algiersDate(now);
  S["RECAP!AT31"] = date;
  S["RECAP!BK34"] = date;
  return S;
}
