// Algerian fiscal calendar — recurring deadlines by tax regime.
// Dates reflect official DGI / CNAS / CASNOS yearly schedules.

export type TaxRegime = "REEL" | "SIMPLIFIE" | "IFU";

export interface FiscalEvent {
  id: string;
  /** ISO date YYYY-MM-DD — the *deadline* (last day of the filing window). */
  date: string;
  /** ISO date YYYY-MM-DD — when the filing window opens (1st of the month). */
  openDate?: string;
  type: "G50" | "CNAS" | "CASNOS" | "CACOBATPH" | "BILAN" | "DAS" | "G12" | "CP" | "TAP" | "IBS" | "301bis";
  label: string;
  regimes: TaxRegime[];
  monthly?: boolean;
  quarterly?: boolean;
  severity: "info" | "warn" | "danger";
}

export interface CalendarOptions {
  /** Total declared employees for the client (drives CNAS frequency). */
  employeeCount?: number;
  /** Whether CACOBATPH (BTP sector) deadlines should be added. */
  hasCacobatph?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** First month of the quarter (0,3,6,9). */
const quarterStartMonth = (m: number) => Math.floor(m / 3) * 3;

/** Generate the next 6 months of fiscal deadlines. */
export const buildFiscalCalendar = (
  regime?: TaxRegime,
  refDate: Date = new Date(),
  opts: CalendarOptions = {},
): FiscalEvent[] => {
  const events: FiscalEvent[] = [];
  const year = refDate.getFullYear();
  const empCount = opts.employeeCount ?? 0;
  const socialMonthly = empCount >= 10;

  // === Monthly G50 (Réel + Simplifié) — declarable from 1st to 20th of FOLLOWING month ===
  for (let i = 0; i < 6; i++) {
    // Reference period = month i months ago relative to current
    const period = new Date(refDate.getFullYear(), refDate.getMonth() + i - 1, 1);
    const due = new Date(period.getFullYear(), period.getMonth() + 1, 20);
    const open = new Date(period.getFullYear(), period.getMonth() + 1, 1);
    const py = period.getFullYear();
    const pm = pad(period.getMonth() + 1);
    events.push({
      id: `g50-${py}-${pm}`,
      date: iso(due),
      openDate: iso(open),
      type: "G50",
      label: `Dépôt G50 — période ${py}-${pm}`,
      regimes: ["REEL", "SIMPLIFIE"],
      monthly: true,
      severity: "warn",
    });
  }

  // === CNAS / CASNOS / CACOBATPH — frequency depends on employee count ===
  // Quarterly: due between 1st and 30th of month following the quarter (Apr/Jul/Oct/Jan).
  // Monthly:   due between 1st and 30th of the following month.
  if (socialMonthly) {
    for (let i = 0; i < 6; i++) {
      const period = new Date(refDate.getFullYear(), refDate.getMonth() + i - 1, 1);
      const due = new Date(period.getFullYear(), period.getMonth() + 1, 30);
      const open = new Date(period.getFullYear(), period.getMonth() + 1, 1);
      const py = period.getFullYear();
      const pm = pad(period.getMonth() + 1);
      events.push({
        id: `cnas-m-${py}-${pm}`,
        date: iso(due), openDate: iso(open),
        type: "CNAS",
        label: `CNAS mensuelle — période ${py}-${pm}`,
        regimes: ["REEL", "SIMPLIFIE", "IFU"],
        monthly: true, severity: "info",
      });
      events.push({
        id: `casnos-m-${py}-${pm}`,
        date: iso(due), openDate: iso(open),
        type: "CASNOS",
        label: `CASNOS mensuelle — période ${py}-${pm}`,
        regimes: ["REEL", "SIMPLIFIE", "IFU"],
        monthly: true, severity: "info",
      });
      if (opts.hasCacobatph) {
        events.push({
          id: `cacobatph-m-${py}-${pm}`,
          date: iso(due), openDate: iso(open),
          type: "CACOBATPH",
          label: `CACOBATPH mensuelle — période ${py}-${pm}`,
          regimes: ["REEL", "SIMPLIFIE", "IFU"],
          monthly: true, severity: "info",
        });
      }
    }
  } else {
    // Quarterly — generate next 4 quarters starting from current
    for (let i = -1; i < 4; i++) {
      const qStart = new Date(refDate.getFullYear(), quarterStartMonth(refDate.getMonth()) + i * 3, 1);
      const due = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 30);
      const open = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 1);
      const qy = qStart.getFullYear();
      const qm = pad(qStart.getMonth() + 1);
      const qLabel = `T${Math.floor(qStart.getMonth() / 3) + 1} ${qy}`;
      events.push({
        id: `cnas-q-${qy}-${qm}`,
        date: iso(due), openDate: iso(open),
        type: "CNAS",
        label: `CNAS trimestrielle — ${qLabel}`,
        regimes: ["REEL", "SIMPLIFIE", "IFU"],
        quarterly: true, severity: "info",
      });
      events.push({
        id: `casnos-q-${qy}-${qm}`,
        date: iso(due), openDate: iso(open),
        type: "CASNOS",
        label: `CASNOS trimestrielle — ${qLabel}`,
        regimes: ["REEL", "SIMPLIFIE", "IFU"],
        quarterly: true, severity: "info",
      });
      if (opts.hasCacobatph) {
        events.push({
          id: `cacobatph-q-${qy}-${qm}`,
          date: iso(due), openDate: iso(open),
          type: "CACOBATPH",
          label: `CACOBATPH trimestrielle — ${qLabel}`,
          regimes: ["REEL", "SIMPLIFIE", "IFU"],
          quarterly: true, severity: "info",
        });
      }
    }
  }

  // === Yearly (Réel) ===
  events.push({
    id: `bilan-${year}`,
    date: `${year}-04-30`,
    type: "BILAN",
    label: `Dépôt Bilan & Liasse fiscale — ${year - 1}`,
    regimes: ["REEL", "SIMPLIFIE"],
    severity: "danger",
  });
  // DAS — official window: 1 to 30 January of the following year.
  events.push({
    id: `das-${year}`,
    date: `${year}-01-30`,
    openDate: `${year}-01-01`,
    type: "DAS",
    label: `DAS (Déclaration Annuelle des Salaires) — exercice ${year - 1}`,
    regimes: ["REEL", "SIMPLIFIE"],
    severity: "danger",
  });
  // Also next year window for visibility
  events.push({
    id: `das-${year + 1}`,
    date: `${year + 1}-01-30`,
    openDate: `${year + 1}-01-01`,
    type: "DAS",
    label: `DAS (Déclaration Annuelle des Salaires) — exercice ${year}`,
    regimes: ["REEL", "SIMPLIFIE"],
    severity: "danger",
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
  for (const m of ["03", "06", "11"]) { // 3 acomptes (CIDTA art. 356)
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
  const sevenAgo = new Date(refDate.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  return filtered
    .filter((e) => e.date >= sevenAgo)
    .sort((a, b) => a.date.localeCompare(b.date));
};

export const daysUntil = (isoDate: string, ref = new Date()): number => {
  const d = new Date(isoDate);
  return Math.round((d.getTime() - ref.getTime()) / 86400000);
};

/** Build the next G50 deadline (20th of the month following the given period). */
export const nextG50Deadline = (ref: Date = new Date()) => {
  // Period being declared = previous month
  const period = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  let due = new Date(period.getFullYear(), period.getMonth() + 1, 20, 23, 59, 59);
  // If today is past the 20th, move to next month
  if (ref.getTime() > due.getTime()) {
    const nextPeriod = new Date(ref.getFullYear(), ref.getMonth(), 1);
    due = new Date(nextPeriod.getFullYear(), nextPeriod.getMonth() + 1, 20, 23, 59, 59);
    return {
      due,
      open: new Date(nextPeriod.getFullYear(), nextPeriod.getMonth() + 1, 1),
      period: nextPeriod,
    };
  }
  return {
    due,
    open: new Date(period.getFullYear(), period.getMonth() + 1, 1),
    period,
  };
};

/** Status color based on the most urgent deadline + checklist completeness. */
export type DeadlineTone = "safe" | "warning" | "overdue";
export const tonalStatus = (events: FiscalEvent[], ref = new Date()): DeadlineTone => {
  const days = events.map((e) => daysUntil(e.date, ref));
  if (days.some((d) => d < 0)) return "overdue";
  if (days.some((d) => d >= 0 && d <= 5)) return "warning";
  return "safe";
};
