import { describe, it, expect } from "vitest";
import { computeIbs, computeIbsAcompte, computeIrgProfessionsLiberales } from "@/lib/accounting/algerianTax";

describe("algerianTax", () => {
  it("computes IBS per sector", () => {
    expect(computeIbs(1_000_000, "PRODUCTION")).toEqual({ rate: 19, ibs: 190_000 });
    expect(computeIbs(1_000_000, "SERVICES").ibs).toBe(260_000);
    expect(computeIbs(-5, "BTPH").ibs).toBe(0);
  });

  it("computes IBS instalments at 30% of N-1", () => {
    expect(computeIbsAcompte(1_000_000)).toEqual({ perAcompte: 300_000, totalThreeAcomptes: 900_000 });
  });

  it("returns zero IRG for zero income and a non-negative total otherwise", () => {
    expect(computeIrgProfessionsLiberales(0).total).toBe(0);
    expect(computeIrgProfessionsLiberales(5_000_000).total).toBeGreaterThan(0);
  });
});
