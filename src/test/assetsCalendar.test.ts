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

import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { ar } from "@/lib/i18n/ar";
import { buildG50Preview } from "@/lib/accounting/algerianTax";

describe("translated labels", () => {
  const dicts = { en, fr, ar } as Record<string, Record<string, string>>;
  it("every fiscal calendar label key exists in en, fr and ar with its placeholders", () => {
    const regimes = ["REEL", "SIMPLIFIE", "IFU"] as const;
    for (const regime of regimes) {
      for (const hasCacobatph of [true, false]) {
        for (const employeeCount of [3, 20]) {
          for (const e of buildFiscalCalendar(regime, new Date(2026, 5, 10), { employeeCount, hasCacobatph })) {
            expect(e.labelKey, e.id).toBeTruthy();
            for (const [lang, d] of Object.entries(dicts)) {
              const text = d[e.labelKey!];
              expect(text, `${lang}:${e.labelKey}`).toBeTruthy();
              for (const k of Object.keys(e.labelParams ?? {})) expect(text, `${lang}:${e.labelKey}`).toContain(`{${k}}`);
            }
          }
        }
      }
    }
  });
  it("every G50 line and section has a translation", () => {
    for (const [period, credit] of [["2023-09", false], ["2026-09", true]] as const) {
      const g = buildG50Preview({
        period, caHt: 1000, tvaCollected: credit ? 0 : 190, tvaDeductible: credit ? 50 : 10, precompteFromPrev: 5, irgSalaries: 10, ibsAcompte: 100,
        tfpTapp: { grossMass: 1000, employeeCount: 25, tfpRate: 1, tfpGross: 10, tfpDeduction: 0, tfpDue: 10, tappRate: 1, tapp: 10, total: 20, threshold: 20, thresholdMet: true },
      });
      for (const l of g.lines) {
        if (!l.labelKey) continue; // TFP/TAPP lines are labelled by their acronym
        for (const d of Object.values(dicts)) expect(d[l.labelKey], l.code).toBeTruthy();
      }
    }
    for (const k of ["g50s_a", "g50s_b", "g50s_c", "g50s_d", "irgb_above", "g50_dgi", "g50_serie", "ps_title"])
      for (const d of Object.values(dicts)) expect(d[k], k).toBeTruthy();
  });
});
