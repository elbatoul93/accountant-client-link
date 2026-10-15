import { describe, it, expect } from "vitest";
import {
  postSalesInvoice, postPurchaseInvoice, postPayrollRun, computeG50FromJournal,
  computeTrialBalance, type JournalLine,
} from "@/lib/accounting/engine";
import {
  computeTvaSettlement, computeTfpTapp, computeIbs, computeIbsAcompte,
} from "@/lib/accounting/algerianTax";
import { computePayslip, computePayrollMass } from "@/lib/accounting/payroll";

const balanced = (lines: JournalLine[]) =>
  lines.reduce((s, l) => s + l.debit, 0) === lines.reduce((s, l) => s + l.credit, 0);

describe("journal postings are balanced", () => {
  it("sales invoice 19% VAT", () => {
    const l = postSalesInvoice({ date: "2026-09-10", ht: 100_000, tva: 19_000, ttc: 119_000, party: "X", number: "F1" });
    expect(balanced(l)).toBe(true);
    expect(l.map((x) => x.account)).toEqual(["411", "70", "44551"]);
    expect(l.every((x) => x.period === "2026-09")).toBe(true);
  });
  it("purchase invoice without VAT has no VAT line", () => {
    const l = postPurchaseInvoice({ date: "2026-09-10", ht: 50_000, tva: 0, ttc: 50_000, party: "Y", number: "A1" });
    expect(balanced(l)).toBe(true);
    expect(l.map((x) => x.account)).toEqual(["60", "401"]);
  });
  it.each([20_000, 30_000, 34_000, 35_000, 80_000, 250_000])("payroll for gross %i", (gross) => {
    const p = computePayslip({ id: "1", name: "A", basic: gross, iew: 0, prc: 0 });
    const l = postPayrollRun({
      date: "2026-09-30", employeeId: "1", employeeName: "A",
      gross: p.gross, ssEmployee: p.ssEmployee, irg: p.irg, net: p.net,
    });
    expect(balanced(l)).toBe(true);
  });
  it("uses 432 for CACOBATPH employers", () => {
    const l = postPayrollRun({
      date: "2026-09-30", employeeId: "1", employeeName: "A",
      gross: 80_000, ssEmployee: 7_200, irg: 0, net: 72_800, hasCacobatph: true,
    });
    expect(l.some((x) => x.account === "432")).toBe(true);
  });
});

describe("full month fixture: sales, purchases and payroll feed the G50", () => {
  const slip = computePayslip({ id: "1", name: "A", basic: 80_000, iew: 0, prc: 0 });
  const lines: JournalLine[] = [
    ...postSalesInvoice({ date: "2026-09-05", ht: 1_000_000, tva: 190_000, ttc: 1_190_000, party: "C", number: "F1" }),
    ...postSalesInvoice({ date: "2026-09-20", ht: 500_000, tva: 45_000, ttc: 545_000, party: "C", number: "F2" }),
    ...postPurchaseInvoice({ date: "2026-09-12", ht: 400_000, tva: 76_000, ttc: 476_000, party: "S", number: "A1" }),
    ...postPayrollRun({
      date: "2026-09-30", employeeId: "1", employeeName: "A",
      gross: slip.gross, ssEmployee: slip.ssEmployee, irg: slip.irg, net: slip.net,
    }),
    // other month: must not leak into September
    ...postSalesInvoice({ date: "2026-10-02", ht: 999_999, tva: 190_000, ttc: 1_189_999, party: "C", number: "F3" }),
  ];

  it("trial balance balances", () => {
    const rows = computeTrialBalance(lines);
    expect(rows.reduce((s, r) => s + r.debit, 0)).toBe(rows.reduce((s, r) => s + r.credit, 0));
  });
  it("G50 for September 2026 (no TAP, no IBS acompte)", () => {
    const g = computeG50FromJournal(lines, { period: "2026-09", ibsPriorYear: 2_000_000 });
    expect(g.caHt).toBe(1_500_000);
    expect(g.tvaCollected).toBe(235_000);
    expect(g.tvaDeductible).toBe(76_000);
    expect(g.tvaDue).toBe(159_000);
    expect(g.salaries).toBe(80_000);
    expect(g.irgSalaries).toBe(slip.irg);
    expect(g.tap).toBe(0);
    expect(g.ibs).toBe(0);
    expect(g.total).toBe(159_000 + slip.irg);
  });
  it("same activity in a pre-repeal month carries 1% TAP", () => {
    const old = lines.map((l) => ({ ...l, date: l.date.replace("2026", "2023"), period: l.period.replace("2026", "2023") }));
    const g = computeG50FromJournal(old, { period: "2023-09" });
    expect(g.tap).toBe(15_000);
  });
  it("filters by client", () => {
    const tagged = lines.map((l) => ({ ...l, clientId: "c1" }));
    expect(computeG50FromJournal(tagged, { period: "2026-09", clientId: "c1" }).caHt).toBe(1_500_000);
    expect(computeG50FromJournal(tagged, { period: "2026-09", clientId: "c2" }).caHt).toBe(0);
  });
});

describe("VAT settlement", () => {
  it("carries a credit forward and consumes it next month", () => {
    const m1 = computeTvaSettlement({ period: "2026-08", tvaCollected: 50_000, tvaDeductible: 120_000 });
    expect(m1.tvaDue).toBe(0);
    expect(m1.precompteToNext).toBe(70_000);
    const m2 = computeTvaSettlement({
      period: "2026-09", tvaCollected: 100_000, tvaDeductible: 10_000, precompteFromPrev: m1.precompteToNext,
    });
    expect(m2.tvaDue).toBe(20_000);
    expect(m2.precompteToNext).toBe(0);
  });
});

describe("TFP / TAPP", () => {
  it("TFP only from 20 employees, TAPP always 1%", () => {
    const small = computeTfpTapp({ grossMass: 1_000_000, employeeCount: 19 });
    expect(small.tfpDue).toBe(0);
    expect(small.tapp).toBe(10_000);
    const big = computeTfpTapp({ grossMass: 2_000_000, employeeCount: 20, formationExpenses: 5_000 });
    expect(big.tfpGross).toBe(20_000);
    expect(big.tfpDue).toBe(15_000);
    expect(big.total).toBe(35_000);
  });
  it("formation expenses cannot push TFP below zero", () => {
    expect(computeTfpTapp({ grossMass: 2_000_000, employeeCount: 25, formationExpenses: 1_000_000 }).tfpDue).toBe(0);
  });
});

describe("IBS", () => {
  it("rates per sector and acompte arithmetic", () => {
    expect(computeIbs(1_000_000, "PRODUCTION").ibs).toBe(190_000);
    expect(computeIbs(1_000_000, "BTPH").ibs).toBe(230_000);
    expect(computeIbs(1_000_000, "SERVICES").ibs).toBe(260_000);
    expect(computeIbs(-5, "SERVICES").ibs).toBe(0);
    expect(computeIbsAcompte(1_000_000)).toEqual({ perAcompte: 300_000, totalThreeAcomptes: 900_000 });
  });
});

describe("payroll mass", () => {
  it("sums payslips", () => {
    const list = [
      { id: "1", name: "A", basic: 80_000, iew: 0, prc: 0 },
      { id: "2", name: "B", basic: 45_000, iew: 0, prc: 0 },
    ];
    const mass = computePayrollMass(list);
    const a = computePayslip(list[0]);
    const b = computePayslip(list[1]);
    expect(mass.grossMass).toBe(a.gross + b.gross);
    expect(mass.irgMass).toBe(a.irg + b.irg);
    expect(mass.employees).toBe(2);
  });
});

describe("G50 from journal carries the VAT credit", () => {
  const lines = postSalesInvoice({ date: "2026-09-05", ht: 100_000, tva: 19_000, ttc: 119_000, party: "C", number: "F1" });
  it("uses the previous month's précompte before computing VAT due", () => {
    const g = computeG50FromJournal(lines, { period: "2026-09", precompteFromPrev: 5_000 });
    expect(g.tvaDue).toBe(14_000);
    expect(g.precompteToNext).toBe(0);
  });
  it("rolls an unused credit forward", () => {
    const g = computeG50FromJournal(lines, { period: "2026-09", precompteFromPrev: 30_000 });
    expect(g.tvaDue).toBe(0);
    expect(g.precompteToNext).toBe(11_000);
  });
});

describe("Tax Intel G50 preview follows the engine", () => {
  it("has the same total and IBS acompte as the engine G50 in an acompte month", async () => {
    const { buildG50Preview } = await import("@/lib/accounting/algerianTax");
    const lines = postSalesInvoice({ date: "2026-06-05", ht: 1_000_000, tva: 190_000, ttc: 1_190_000, party: "C", number: "F1" });
    const g = computeG50FromJournal(lines, { period: "2026-06", precompteFromPrev: 40_000, ibsPriorYear: 1_000_000 });
    const p = buildG50Preview({
      period: g.period, caHt: g.caHt, tvaCollected: g.tvaCollected, tvaDeductible: g.tvaDeductible,
      precompteFromPrev: g.precompteFromPrev, tapRate: g.tapRate, irgSalaries: g.irgSalaries, ibsAcompte: g.ibs,
    });
    expect(g.ibs).toBe(300_000);
    expect(p.total).toBe(g.total);
    expect(p.tva.tvaDue).toBe(g.tvaDue);
  });
});
