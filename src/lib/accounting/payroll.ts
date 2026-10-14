// Algerian payroll engine — calculator, CNAS, DAS, employer share.
// All amounts in DA. IRG monthly progressive scale (simplified standard table).

export interface PayrollEmployee {
  id: string;
  clientId?: string;
  name: string;
  position?: string;
  /** National ID (NSS / matricule CNAS) */
  nss?: string;
  /** Date d'embauche (YYYY-MM-DD) */
  hireDate?: string;
  /** Date de départ (YYYY-MM-DD) — set to mark a movement */
  endDate?: string;
  /** Salaire de base */
  basic: number;
  /** Indemnité d'expérience (IEP/IEW) */
  iew: number;
  /** Prime de rendement collectif */
  prc: number;
  /** Other indemnités (transport, panier, …) */
  other?: number;
  /** Number of dependents (for family allowances) — informational */
  dependents?: number;
}

/**
 * Algerian monthly IRG/Salaires scale (barème LF 2022, CIDTA art. 104).
 * It is the annual scale (0 / 23 / 27 / 30 / 33 / 35 % on 240k, 480k, 960k,
 * 1.92M, 3.84M DA) divided by 12.
 */
export const IRG_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 20000,  rate: 0    },
  { upTo: 40000,  rate: 0.23 },
  { upTo: 80000,  rate: 0.27 },
  { upTo: 160000, rate: 0.30 },
  { upTo: 320000, rate: 0.33 },
  { upTo: Infinity, rate: 0.35 },
];

/** Monthly taxable income up to which no IRG is due. */
export const IRG_EXEMPT_CEILING = 30000;
/** Upper end of the zone where the supplementary reduction applies. */
export const IRG_REDUCTION_CEILING = 35000;
/** Abattement of 40 % on the computed IRG, bounded per month. */
export const IRG_ABATEMENT_RATE = 0.4;
export const IRG_ABATEMENT_MIN = 1000;
export const IRG_ABATEMENT_MAX = 1500;

/**
 * Monthly IRG on a salary: progressive scale, then the 40 % abattement
 * (min 1 000 / max 1 500 DA), then the degressive formula
 * IRG × 137/51 − 27 925/8 for taxable income between 30 000 and 35 000 DA.
 * Income up to 30 000 DA is exempt.
 */
export const computeIRGSalaire = (taxable: number): number => {
  if (!Number.isFinite(taxable) || taxable <= IRG_EXEMPT_CEILING) return 0;
  let irg = 0;
  let prev = 0;
  for (const b of IRG_BRACKETS) {
    const slice = Math.min(taxable, b.upTo) - prev;
    if (slice > 0) irg += slice * b.rate;
    prev = b.upTo;
    if (taxable <= b.upTo) break;
  }
  const abatement = Math.min(
    irg,
    Math.min(IRG_ABATEMENT_MAX, Math.max(IRG_ABATEMENT_MIN, irg * IRG_ABATEMENT_RATE)),
  );
  irg -= abatement;
  if (taxable < IRG_REDUCTION_CEILING) {
    irg = Math.max(0, (irg * 137) / 51 - 27925 / 8);
  }
  return Math.round(irg);
};

/** Social security (CNAS) rates on the gross salary. */
export const SS_EMPLOYEE_RATE = 0.09;
/** Employer share: 25 % + 0.5 % œuvres sociales (FNPOS). */
export const SS_EMPLOYER_RATE = 0.255;
export const SS_EMPLOYER_RATE_LABEL = "25,5%";

export interface PayslipBreakdown {
  basic: number;
  iew: number;
  prc: number;
  other: number;
  /** Salaire brut = basic + iew + prc + other */
  gross: number;
  /** Salaire soumis à la SS (here = gross, simplified) */
  ssBase: number;
  /** Cotisation salariale 9 % */
  ssEmployee: number;
  /** Salaire imposable = gross − ssEmployee */
  taxable: number;
  /** IRG/Salaires (barème progressif) */
  irg: number;
  /** Net à payer = gross − ssEmployee − irg */
  net: number;
  /** Cotisation patronale CNAS 25,5 % */
  ssEmployer: number;
  /** Coût total employeur = gross + ssEmployer */
  employerCost: number;
}

export const computePayslip = (e: PayrollEmployee): PayslipBreakdown => {
  const basic = e.basic || 0;
  const iew = e.iew || 0;
  const prc = e.prc || 0;
  const other = e.other || 0;
  const gross = basic + iew + prc + other;
  const ssBase = gross;
  const ssEmployee = Math.round(ssBase * SS_EMPLOYEE_RATE);
  const taxable = gross - ssEmployee;
  const irg = computeIRGSalaire(taxable);
  const net = gross - ssEmployee - irg;
  const ssEmployer = Math.round(gross * SS_EMPLOYER_RATE);
  const employerCost = gross + ssEmployer;
  return { basic, iew, prc, other, gross, ssBase, ssEmployee, taxable, irg, net, ssEmployer, employerCost };
};

/** Aggregated payroll mass for a list of employees. */
export interface PayrollMass {
  employees: number;
  grossMass: number;
  ssEmployeeMass: number;
  ssEmployerMass: number; // 25,5 %
  irgMass: number;
  netMass: number;
  employerCost: number;
}

export const computePayrollMass = (list: PayrollEmployee[]): PayrollMass => {
  const slips = list.map(computePayslip);
  return {
    employees: list.length,
    grossMass: slips.reduce((s, x) => s + x.gross, 0),
    ssEmployeeMass: slips.reduce((s, x) => s + x.ssEmployee, 0),
    ssEmployerMass: slips.reduce((s, x) => s + x.ssEmployer, 0),
    irgMass: slips.reduce((s, x) => s + x.irg, 0),
    netMass: slips.reduce((s, x) => s + x.net, 0),
    employerCost: slips.reduce((s, x) => s + x.employerCost, 0),
  };
};

/** CNAS Avis d'échéance — total cotisations (34,5 % of gross mass). */
export interface CnasAvis {
  period: string;          // YYYY-MM (monthly) or YYYY-Qn (quarterly)
  frequency: "monthly" | "quarterly";
  grossMass: number;
  partSalariale: number;   // 9 %
  partPatronale: number;   // 25,5 %
  total: number;           // 34,5 %
  employees: number;
}

export const buildCnasAvis = (
  list: PayrollEmployee[],
  period: string,
  frequency: "monthly" | "quarterly",
): CnasAvis => {
  const m = computePayrollMass(list);
  return {
    period, frequency,
    grossMass: m.grossMass,
    partSalariale: m.ssEmployeeMass,
    partPatronale: m.ssEmployerMass,
    total: m.ssEmployeeMass + m.ssEmployerMass,
    employees: m.employees,
  };
};

/** Déclaration de mouvements: hires & departures inside a period. */
export interface MovementsReport {
  period: string;
  hires: PayrollEmployee[];
  departures: PayrollEmployee[];
}

export const buildMovements = (
  list: PayrollEmployee[],
  period: string, // YYYY-MM
): MovementsReport => {
  const inMonth = (d?: string) => !!d && d.slice(0, 7) === period;
  return {
    period,
    hires: list.filter((e) => inMonth(e.hireDate)),
    departures: list.filter((e) => inMonth(e.endDate)),
  };
};

/** DAS — Annual Salaries Declaration row per employee. */
export interface DasRow {
  employeeId: string;
  name: string;
  nss?: string;
  position?: string;
  monthsWorked: number;
  grossAnnual: number;
  ssAnnual: number;
  taxableAnnual: number;
  irgAnnual: number;
  netAnnual: number;
}

/** Estimate the DAS by projecting the current monthly payslip over the months worked.
 *  Use `buildDASFromPayslips` when real payroll runs exist. */
export const buildDAS = (list: PayrollEmployee[], year: number): DasRow[] => {
  return list.map((e) => {
    const p = computePayslip(e);
    // months worked: if hireDate in same year, prorate; else 12.
    let months = 12;
    if (e.hireDate?.startsWith(`${year}`)) {
      const m = parseInt(e.hireDate.slice(5, 7), 10);
      months = 13 - m;
    }
    if (e.endDate?.startsWith(`${year}`)) {
      const m = parseInt(e.endDate.slice(5, 7), 10);
      months = Math.min(months, m);
    }
    months = Math.max(0, Math.min(12, months));
    return {
      employeeId: e.id,
      name: e.name,
      nss: e.nss,
      position: e.position,
      monthsWorked: months,
      grossAnnual: p.gross * months,
      ssAnnual: p.ssEmployee * months,
      taxableAnnual: p.taxable * months,
      irgAnnual: p.irg * months,
      netAnnual: p.net * months,
    };
  });
};

/** One payslip actually paid (a row of acc_payslips joined with its run period). */
export interface PayslipRecord {
  employeeKey: string; // nss, else name
  name: string;
  nss?: string;
  period: string; // YYYY-MM
  gross: number;
  ssEmployee: number;
  taxable: number;
  irg: number;
  net: number;
}

/** Build the DAS from payslips that were really paid in `year` (one row per employee). */
export const buildDASFromPayslips = (records: PayslipRecord[], year: number): DasRow[] => {
  const byEmployee = new Map<string, { rec: PayslipRecord; periods: Map<string, PayslipRecord> }>();
  for (const r of records) {
    if (!r.period.startsWith(`${year}-`)) continue;
    const cur = byEmployee.get(r.employeeKey) ?? { rec: r, periods: new Map() };
    cur.periods.set(r.period, r); // a month counts once even if posted twice
    byEmployee.set(r.employeeKey, cur);
  }
  return Array.from(byEmployee.entries()).map(([key, { rec, periods }]) => {
    const slips = Array.from(periods.values());
    const sum = (f: (x: PayslipRecord) => number) => slips.reduce((s, x) => s + f(x), 0);
    return {
      employeeId: key,
      name: rec.name,
      nss: rec.nss,
      position: undefined,
      monthsWorked: slips.length,
      grossAnnual: sum((x) => x.gross),
      ssAnnual: sum((x) => x.ssEmployee),
      taxableAnnual: sum((x) => x.taxable),
      irgAnnual: sum((x) => x.irg),
      netAnnual: sum((x) => x.net),
    };
  });
};

/** Convert any rows array to a CSV string (Excel-friendly). */
export const toCSV = (rows: Record<string, any>[]): string => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    let s = v == null ? "" : String(v);
    // Neutralise spreadsheet formula injection in text cells (not numbers).
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h])).join(";"))].join("\n");
};

export const downloadCSV = (filename: string, rows: Record<string, any>[]) => {
  const blob = new Blob(["\uFEFF" + toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};
