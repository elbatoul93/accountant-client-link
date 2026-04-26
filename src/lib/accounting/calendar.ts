// Algerian fiscal calendar — recurring deadlines by tax regime.
// Dates reflect official DGI / CNAS / CASNOS yearly schedules.

export type TaxRegime = "REEL" | "SIMPLIFIE" | "IFU";

export interface FiscalEvent {
  id: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  type: "G50" | "CNAS" | "CASNOS" | "BILAN" | "DAS" | "G12" | "CP" | "TAP" | "IBS" | "301bis";
  label: string;
  regimes: TaxRegime[];
  monthly?: boolean;
  severity: "info" | "warn" | "danger";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Generate the next 6 months of fiscal deadlines. */
export const buildFiscalCalendar = (regime?: TaxRegime, refDate = new Date()): FiscalEvent[] => {
  const events: FiscalEvent[] = [];
  const year = refDate.getFullYear();

  // Monthly recurring (Réel + Simplifié)
  for (let i = 0; i < 6; i++) {
    const d = new Date(refDate.getFullYear(), refDate.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    // G50 — 20th of every month
    events.push({
      id: `g50-${y}-${m}`,
      date: `${y}-${m}-20`,
      type: "G50",
      label: `Dépôt G50 — ${y}-${m}`,
      regimes: ["REEL", "SIMPLIFIE"],
      monthly: true,
      severity: "warn",
    });
    // CNAS / CASNOS — 30th of every month
    events.push({
      id: `cnas-${y}-${m}`,
      date: `${y}-${m}-30`,
      type: "CNAS",
      label: `Déclaration CNAS — ${y}-${m}`,
      regimes: ["REEL", "SIMPLIFIE", "IFU"],
      monthly: true,
      severity: "info",
    });
  }

  // Yearly (Réel)
  events.push({
    id: `bilan-${year}`,
    date: `${year}-04-30`,
    type: "BILAN",
    label: `Dépôt Bilan & Liasse fiscale — ${year - 1}`,
    regimes: ["REEL", "SIMPLIFIE"],
    severity: "danger",
  });
  events.push({
    id: `das-${year}`,
    date: `${year}-04-30`,
    type: "DAS",
    label: `DAS (Déclaration Annuelle des Salaires) — ${year - 1}`,
    regimes: ["REEL", "SIMPLIFIE"],
    severity: "warn",
  });
  events.push({
    id: `301bis-${year}`,
    date: `${year}-04-30`,
    type: "301bis",
    label: `État 301 bis — récapitulatif annuel salaires ${year - 1}`,
    regimes: ["REEL", "SIMPLIFIE"],
    severity: "warn",
  });

  // IFU specific
  events.push({
    id: `g12-${year}`,
    date: `${year}-02-01`,
    type: "G12",
    label: `Déclaration G12 (IFU) — ${year - 1}`,
    regimes: ["IFU"],
    severity: "danger",
  });
  for (const m of ["03", "06", "09", "12"]) {
    events.push({
      id: `cp-${year}-${m}`,
      date: `${year}-${m}-20`,
      type: "CP",
      label: `Acompte trimestriel IFU (CP) — ${year}-${m}`,
      regimes: ["IFU"],
      severity: "warn",
    });
  }

  // IBS acomptes (Réel/Simplifié)
  for (const m of ["03", "06", "09", "11"]) {
    events.push({
      id: `ibs-${year}-${m}`,
      date: `${year}-${m}-20`,
      type: "IBS",
      label: `Acompte provisionnel IBS (${m}) — ${year}`,
      regimes: ["REEL", "SIMPLIFIE"],
      severity: "info",
    });
  }

  const filtered = regime ? events.filter((e) => e.regimes.includes(regime)) : events;
  // Only future or within the last 7 days
  const now = refDate.toISOString().slice(0, 10);
  const sevenAgo = new Date(refDate.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  return filtered
    .filter((e) => e.date >= sevenAgo)
    .sort((a, b) => a.date.localeCompare(b.date));
};

export const daysUntil = (iso: string, ref = new Date()): number => {
  const d = new Date(iso);
  return Math.round((d.getTime() - ref.getTime()) / 86400000);
};
