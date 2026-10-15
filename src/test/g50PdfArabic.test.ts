import { describe, it, expect } from "vitest";
import { bidiRuns, shapeArabic } from "../../supabase/functions/g50-pdf/arabic";

const cp = (s: string) => [...s].map((c) => c.codePointAt(0)!.toString(16));

describe("g50-pdf Arabic shaping", () => {
  it("picks isolated, initial, medial and final forms", () => {
    expect(cp(shapeArabic("ب"))).toEqual(["fe8f"]);
    expect(cp(shapeArabic("بب"))).toEqual(["fe91", "fe90"]);
    expect(cp(shapeArabic("ببب"))).toEqual(["fe91", "fe92", "fe90"]);
  });
  it("does not connect after right-joining letters", () => {
    // alef (right-joining) then beh: beh starts a new group
    expect(cp(shapeArabic("اب"))).toEqual(["fe8d", "fe8f"]);
  });
  it("forms the lam-alef ligature and drops diacritics", () => {
    expect(cp(shapeArabic("لا"))).toEqual(["fefb"]);
    expect(cp(shapeArabic("بلا"))).toEqual(["fe91", "fefc"]);
    expect(cp(shapeArabic("بَ"))).toEqual(["fe8f"]);
  });
  it("leaves digits and Latin letters alone", () => {
    expect(shapeArabic("12 AB")).toBe("12 AB");
  });
});

describe("g50-pdf bidi runs", () => {
  const AR = "حي";
  it("keeps the space next to Arabic when a digit run sits between Arabic words", () => {
    const runs = bidiRuns(`${AR} 500 ${AR}`);
    expect(runs.map((r) => [r.rtl, r.s])).toEqual([[true, `${AR} `], [false, "500"], [true, ` ${AR}`]]);
  });
  it("keeps spaces inside a Latin stretch", () => {
    const runs = bidiRuns(`${AR} ABC Services`);
    expect(runs.map((r) => [r.rtl, r.s])).toEqual([[true, `${AR} `], [false, "ABC Services"]]);
  });
});
