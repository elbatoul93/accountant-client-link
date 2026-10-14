import { describe, it, expect } from "vitest";
import {
  computeIRGSalaire, computePayslip, buildCnasAvis, toCSV, SS_EMPLOYER_RATE, buildDASFromPayslips,
} from "@/lib/accounting/payroll";
import { buildG50Preview, tapRateForPeriod } from "@/lib/accounting/algerianTax";
import { computeG50FromJournal } from "@/lib/accounting/engine";
import { buildFiscalCalendar } from "@/lib/accounting/calendar";

describe("IRG salaires (barème mensuel + abattement)", () => {
  it("is exempt up to 30 000 DA", () => {
    expect(computeIRGSalaire(0)).toBe(0);
    expect(computeIRGSalaire(20_000)).toBe(0);
    expect(computeIRGSalaire(30_000)).toBe(0);
  });
  it("applies the degressive formula between 30 000 and 35 000 (DGI example: 34 000 -> 1 699)", () => {
    expect(computeIRGSalaire(34_000)).toBe(1699);
  });
  it("applies the 40% abattement bounded to 1 000 / 1 500", () => {
    // 35 000: 15 000 x 23% = 3 450 -> abattement capped 1 380 -> 2 070
    expect(computeIRGSalaire(35_000)).toBe(2070);
    // 40 000: 4 600 -> abattement 1 500 (cap) -> 3 100
    expect(computeIRGSalaire(40_000)).toBe(3100);
  });
  it("is progressive and monotonic at higher incomes", () => {
    // 100 000: 4600 + 40000x27% + 20000x30% = 4600+10800+6000 = 21 400 -> -1 500
    expect(computeIRGSalaire(100_000)).toBe(19_900);
    let prev = 0;
    for (let t = 30_000; t <= 400_000; t += 1_000) {
      const v = computeIRGSalaire(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it("ignores NaN input", () => {
    expect(computeIRGSalaire(Number.NaN)).toBe(0);
  });
});

describe("payslip and CNAS", () => {
  it("computes a payslip", () => {
    const p = computePayslip({ id: "1", name: "A", basic: 80_000, iew: 0, prc: 0 });
    expect(p.ssEmployee).toBe(7200);
    expect(p.taxable).toBe(72_800);
    expect(p.irg).toBe(computeIRGSalaire(72_800));
    expect(p.net).toBe(p.gross - p.ssEmployee - p.irg);
    expect(p.ssEmployer).toBe(Math.round(80_000 * SS_EMPLOYER_RATE));
    expect(p.employerCost).toBe(p.gross + p.ssEmployer);
  });
  it("totals CNAS at 34.5%", () => {
    const a = buildCnasAvis([{ id: "1", name: "A", basic: 100_000, iew: 0, prc: 0 }], "2026-09", "monthly");
    expect(a.total).toBe(34_500);
  });
  it("neutralises formula injection in CSV text cells", () => {
    expect(toCSV([{ a: "=1+1", b: -5 }])).toContain("'=1+1");
    expect(toCSV([{ a: "x", b: -5 }])).toContain("x;-5");
  });
});

describe("TAP repeal (LF 2024)", () => {
  it("applies 1% before 2024 and nothing from 2024-01", () => {
    expect(tapRateForPeriod("2023-12")).toBe(1);
    expect(tapRateForPeriod("2024-01")).toBe(0);
    expect(tapRateForPeriod("2026-10")).toBe(0);
  });
  it("omits the TAP line from the G50 after the repeal", () => {
    const base = { caHt: 1_000_000, tvaCollected: 190_000, tvaDeductible: 0, irgSalaries: 0 };
    const after = buildG50Preview({ ...base, period: "2026-09" });
    expect(after.lines.find((l) => l.code === "A-TAP")).toBeUndefined();
    expect(after.total).toBe(190_000);
    const before = buildG50Preview({ ...base, period: "2023-09" });
    expect(before.lines.find((l) => l.code === "A-TAP")?.amount).toBe(10_000);
  });
});

describe("IBS acomptes", () => {
  it("only appear in March, June and November", () => {
    const g = (period: string) => computeG50FromJournal([], { period, ibsPriorYear: 1_000_000 }).ibs;
    expect(g("2026-03")).toBe(300_000);
    expect(g("2026-06")).toBe(300_000);
    expect(g("2026-11")).toBe(300_000);
    expect(g("2026-04")).toBe(0);
    expect(g("2026-09")).toBe(0);
  });
  it("calendar lists exactly three IBS acomptes", () => {
    const ev = buildFiscalCalendar("REEL", new Date(2026, 0, 2)).filter((e) => e.type === "IBS");
    expect(ev.map((e) => e.date)).toEqual(["2026-03-20", "2026-06-20", "2026-11-20"]);
  });
});

describe("DAS from real payslips", () => {
  const rec = (period: string, gross: number, irg = 0) => ({
    employeeKey: "c1:123", name: "A", nss: "123", period, gross, ssEmployee: gross * 0.09,
    taxable: gross * 0.91, irg, net: gross * 0.91 - irg,
  });
  it("sums what was paid, counts each month once and ignores other years", () => {
    const rows = buildDASFromPayslips(
      [rec("2026-01", 100_000, 5_000), rec("2026-02", 120_000, 7_000), rec("2026-02", 120_000, 7_000), rec("2025-12", 999_999)],
      2026,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].monthsWorked).toBe(2);
    expect(rows[0].grossAnnual).toBe(220_000);
    expect(rows[0].irgAnnual).toBe(12_000);
  });
});
