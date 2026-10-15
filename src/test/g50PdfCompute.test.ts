import { describe, it, expect } from "vitest";
import { algiersDate, computeSlots, fmtAccounting, fmtInt, parseG50Input } from "../../supabase/functions/g50-pdf/compute";

const base = { companyName: "SARL Test", caHtTotal: 0, caHtImposable: 0 };
const NOW = new Date("2026-10-15T09:00:00Z");

describe("g50-pdf number formats (match the template's Excel formats)", () => {
  it("formats whole units with thousands separators", () => {
    expect(fmtInt(0)).toBe("0");
    expect(fmtInt(1234567.5)).toBe("1,234,568");
  });
  it("shows zero as a dash in accounting cells", () => {
    expect(fmtAccounting(0, 2)).toBe("-");
    expect(fmtAccounting(0.004, 2)).toBe("0.00");
    expect(fmtAccounting(0.1, 0)).toBe("0");
    expect(fmtAccounting(234567.83, 2)).toBe("234,567.83");
    expect(fmtAccounting(234567.83, 0)).toBe("234,568");
    expect(fmtAccounting(5, 2)).toBe("5.00");
  });
  it("prints the date in Algeria's time zone as dd/mm/yyyy", () => {
    expect(algiersDate(NOW)).toBe("15/10/2026");
    expect(algiersDate(new Date("2026-12-31T23:30:00Z"))).toBe("01/01/2027");
  });
});

describe("g50-pdf values", () => {
  it("computes the VAT chain the way the template does (19% of the taxable turnover)", () => {
    const s = computeSlots({ ...base, caHtTotal: 1500000, caHtImposable: 1234567.5 }, NOW);
    expect(s["T.V.A!AQ22"]).toBe("1,500,000");
    expect(s["T.V.A!BQ22"]).toBe("1,234,568");
    expect(s["T.V.A!CH22"]).toBe("234,567.83");
    expect(s["T.V.A!CH31"]).toBe("234,568");
    expect(s["T.V.A!CD42"]).toBe("234,567.83");
    expect(s["RECAP!Y35"]).toBe("234,568");
    expect(s["RECAP!Y39"]).toBe("234,568");
  });
  it("leaves turnover empty and totals as dashes when there is none", () => {
    const s = computeSlots(base, NOW);
    expect(s["T.V.A!AQ22"]).toBeUndefined();
    expect(s["T.V.A!CH22"]).toBe("-");
    expect(s["T.V.A!CH31"]).toBe("0");
    expect(s["RECAP!Y39"]).toBe("-");
  });
  it("puts the NIF one digit per box, the quarter in Y7, and keeps the BP label", () => {
    const s = computeSlots({ ...base, nif: "0999 1601-0012345 99", trimestre: "3", bp: "12" }, NOW);
    expect(["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R"].map((c) => s[`IBS-IRG!${c}22`]).join("")).toBe("099916010012345");
    expect(s["IBS-IRG!Y7"]).toBe("3");
    expect(s["IBS-IRG!U7"]).toBeUndefined();
    expect(s["IBS-IRG!BW23"]).toBe("BP : 12");
    expect(computeSlots(base, NOW)["IBS-IRG!BW23"]).toBe("BP :");
  });
});

describe("g50-pdf input parsing", () => {
  it("requires a company name and drops unknown fields", () => {
    expect(parseG50Input(null)).toBeNull();
    expect(parseG50Input({ companyName: "  " })).toBeNull();
    const p = parseG50Input({ ...base, evil: "x", month: "13", year: "2026", activity: "a\u0000b".repeat(200) })!;
    expect("evil" in p).toBe(false);
    expect(p.month).toBe("");
    expect(p.year).toBe("2026");
    expect(p.activity!.length).toBeLessThanOrEqual(200);
    expect(p.activity).not.toContain(String.fromCharCode(0));
  });
  it("ignores negative, non-finite or non-numeric amounts", () => {
    const p = parseG50Input({ ...base, caHtTotal: -5, caHtImposable: "12" })!;
    expect(p.caHtTotal).toBe(0);
    expect(p.caHtImposable).toBe(0);
  });
});

describe("g50-pdf layout", () => {
  it("has a position for every value the function can draw", async () => {
    const { LAYOUT } = await import("../../supabase/functions/g50-pdf/assets/layout");
    const s = computeSlots({ ...base, activity: "a", address: "a", month: "01", trimestre: "1", year: "2026", direction: "a", commune: "a", nif: "123456789012345", bp: "1", caHtTotal: 1, caHtImposable: 1 }, NOW);
    for (const id of Object.keys(s)) expect(LAYOUT[id], id).toBeDefined();
  });
});
