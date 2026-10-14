import { describe, it, expect } from "vitest";
import { buildAmortizationSchedule } from "@/lib/accounting/assets";
import { buildFiscalCalendar } from "@/lib/accounting/calendar";

describe("asset schedule (prorata temporis)", () => {
  const base = { id: "1", label: "PC", category: "computers" as const, cost: 480_000 };
  it("charges a full year for a January purchase", () => {
    const rows = buildAmortizationSchedule({ ...base, acquiredAt: "2026-01-15" });
    expect(rows.map((r) => r.year)).toEqual([2026, 2027, 2028, 2029]);
    expect(rows[0].annuity).toBe(120_000);
    expect(rows[3].vnc).toBe(0);
  });
  it("prorates the first and last years for a July purchase (25%: 48 months)", () => {
    const rows = buildAmortizationSchedule({ ...base, acquiredAt: "2026-07-01" });
    expect(rows[0].annuity).toBe(60_000); // 6 months
    expect(rows[1].annuity).toBe(120_000);
    expect(rows[4].year).toBe(2030);
    expect(rows[4].annuity).toBe(60_000); // last 6 months
    expect(rows.reduce((s, r) => s + r.annuity, 0)).toBeCloseTo(480_000);
    expect(rows[rows.length - 1].vnc).toBe(0);
  });
  it("returns nothing for a zero cost", () => {
    expect(buildAmortizationSchedule({ ...base, cost: 0, acquiredAt: "2026-01-01" })).toEqual([]);
  });
});

describe("IFU calendar", () => {
  it("has G12 on 30 June and G12 bis on 20 January", () => {
    const ev = buildFiscalCalendar("IFU", new Date(2026, 0, 2)).filter((e) => e.type === "G12");
    expect(ev.map((e) => e.date)).toEqual(["2026-06-30", "2027-01-20"]);
  });
});
