import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
import { fillG50Workbook } from "@/lib/g50Export";
import { g50Amounts } from "@/lib/g50Amounts";
import { computeSlots, parseG50Input } from "../../supabase/functions/g50-pdf/compute";
import { LAYOUT } from "../../supabase/functions/g50-pdf/assets/layout";

const NOW = new Date("2026-10-15T09:00:00Z");
const dialog = { companyName: "SARL Test", month: "10", year: "2026", caHtTotal: 1_000_000, caHtImposable: 800_000, salaries: 200_000, benefice: 150_000, rTap: 0, rTva: 19, rIrg: 10, rIbs: 23 };
const slotsFor = (over: Record<string, unknown> = {}) => computeSlots(parseG50Input({ ...dialog, ...over })!, NOW);
const num = (s: string | undefined) => (s === undefined || s === "-" ? 0 : Number(s.replace(/,/g, "")));

describe("G50 form carries every amount the dialog adds", () => {
  it("the dialog total is the total printed on the form", () => {
    const a = g50Amounts(dialog);
    expect(a).toEqual({ tva: 152_000, tap: 0, irg: 20_000, ibs: 34_500, total: 206_500 });
    const s = slotsFor();
    expect(num(s["RECAP!Y39"])).toBe(Math.round(a.total));
    expect(num(s["RECAP!Y35"]) + num(s["RECAP!Y31"]) + num(s["RECAP!Y27"]) + num(s["RECAP!Y34"])).toBe(Math.round(a.total));
  });
  it("puts IBS on the acompte line, IRG on the salaries line, and their totals and recap lines", () => {
    const s = slotsFor();
    expect(s["IBS-IRG!BX30"]).toBe("34,500");
    expect(s["IBS-IRG!BX34"]).toBe("34,500");
    expect(s["IBS-IRG!AY50"]).toBe("200,000");
    expect(s["IBS-IRG!BX50"]).toBe("20,000");
    expect(s["IBS-IRG!BX56"]).toBe("20,000");
    expect(s["RECAP!Y27"]).toBe("34,500");
    expect(s["RECAP!Y31"]).toBe("20,000");
    expect(s["RECAP!Y35"]).toBe("152,000");
    expect(s["D.TIMBRE!H15"]).toBeUndefined();
    expect(s["D.TIMBRE!BL15"]).toBe("%");
  });
  it("prints dashes, not amounts, when there is no IBS, IRG or TAP", () => {
    const s = slotsFor({ salaries: 0, benefice: 0 });
    expect(s["IBS-IRG!BX30"]).toBeUndefined();
    expect(s["IBS-IRG!BX50"]).toBeUndefined();
    expect(s["IBS-IRG!AY50"]).toBeUndefined();
    for (const id of ["IBS-IRG!BX34", "IBS-IRG!BX56", "RECAP!Y27", "RECAP!Y31", "RECAP!Y34", "D.TIMBRE!BP21"]) expect(s[id], id).toBe("-");
    expect(s["RECAP!Y39"]).toBe("152,000");
  });
  it("lists a TAP rate for an earlier period under 'Autres impôts et taxes'", () => {
    const s = slotsFor({ rTap: 1.5, salaries: 0, benefice: 0 });
    expect(s["D.TIMBRE!H15"]).toBe("TAP");
    expect(s["D.TIMBRE!AS15"]).toBe("1,000,000");
    expect(s["D.TIMBRE!BL15"]).toBe("1.5%");
    expect(s["D.TIMBRE!BP15"]).toBe("15,000.00");
    expect(s["D.TIMBRE!BP21"]).toBe("15,000.00");
    expect(s["RECAP!Y34"]).toBe("15,000");
    expect(s["RECAP!Y39"]).toBe("167,000");
  });
  it("uses the 9% row for a 9% VAT rate and the 19% row otherwise", () => {
    const s9 = slotsFor({ rTva: 9, salaries: 0, benefice: 0 });
    expect(s9["T.V.A!AQ11"]).toBe("1,000,000");
    expect(s9["T.V.A!BQ11"]).toBe("800,000");
    expect(s9["T.V.A!CH11"]).toBe("72,000.00");
    expect(s9["T.V.A!CH22"]).toBe("-");
    expect(s9["T.V.A!AQ22"]).toBeUndefined();
    expect(s9["RECAP!Y35"]).toBe("72,000");
    const s19 = slotsFor({ salaries: 0, benefice: 0 });
    expect(s19["T.V.A!CH22"]).toBe("152,000.00");
    expect(s19["T.V.A!CH11"]).toBe("-");
  });
  it("keeps an older client's request (no rates) at VAT 19% with no other amounts", () => {
    const old = computeSlots(parseG50Input({ companyName: "X", caHtTotal: 100, caHtImposable: 100 })!, NOW);
    expect(old["T.V.A!CH22"]).toBe("19.00");
    expect(old["RECAP!Y39"]).toBe("19");
    expect(old["IBS-IRG!BX30"]).toBeUndefined();
  });
  it("has a position on the form for every value, including the new ones", () => {
    const s = slotsFor({ rTap: 2, rTva: 9, activity: "a", address: "a", month: "01", trimestre: "1", direction: "a", commune: "a", nif: "123456789012345", bp: "1" });
    for (const id of Object.keys(s)) expect(LAYOUT[id], id).toBeDefined();
  });
});

describe("Excel export fills the same cells as the PDF", () => {
  const filled = async (over: Record<string, unknown>) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile("public/templates/G50_template.xlsx");
    fillG50Workbook(wb, { ...dialog, ...over, fileName: "x.xlsx" });
    return { wb, slots: slotsFor(over) };
  };
  const cell = (wb: ExcelJS.Workbook, id: string) => {
    const [sheet, addr] = id.split("!");
    return wb.getWorksheet(sheet)!.getCell(addr).value;
  };
  // Cells the app writes directly; the template's formulas add up the rest.
  const DIRECT = ["IBS-IRG!BX30", "IBS-IRG!AY50", "IBS-IRG!BX50", "T.V.A!AQ22", "T.V.A!BQ22", "D.TIMBRE!AS15", "D.TIMBRE!BP15"];
  it("writes the amounts the PDF prints", async () => {
    const { wb, slots } = await filled({ rTap: 2 });
    for (const id of DIRECT) expect(cell(wb, id), id).toBe(num(slots[id]));
    expect(cell(wb, "D.TIMBRE!H15")).toBe("TAP");
    expect(cell(wb, "D.TIMBRE!BL15")).toBeCloseTo(0.02);
  });
  it("uses the 9% VAT row", async () => {
    const { wb, slots } = await filled({ rTva: 9, rTap: 0 });
    expect(cell(wb, "T.V.A!AQ11")).toBe(num(slots["T.V.A!AQ11"]));
    expect(cell(wb, "T.V.A!BQ11")).toBe(num(slots["T.V.A!BQ11"]));
    expect(cell(wb, "T.V.A!BQ22")).toBeNull();
  });
  it("leaves IBS, IRG and TAP cells empty when there is none", async () => {
    const { wb } = await filled({ salaries: 0, benefice: 0, rTap: 0 });
    for (const id of ["IBS-IRG!BX30", "IBS-IRG!AY50", "IBS-IRG!BX50", "D.TIMBRE!H15", "D.TIMBRE!BP15"]) expect(cell(wb, id), id).toBeNull();
  });
});
