import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
import { G50PdfError, isG50PdfUnavailable } from "@/lib/g50Export";

describe("g50-pdf fallback", () => {
  it("falls back for retryable or provider errors", () => {
    expect(isG50PdfUnavailable(new G50PdfError("x", "provider_unavailable", true))).toBe(true);
    expect(isG50PdfUnavailable(new G50PdfError("x", "rate_limited", true))).toBe(true);
    expect(isG50PdfUnavailable(new G50PdfError("x", "not_configured", false))).toBe(true);
  });
  it("falls back for the legacy function (no code)", () => {
    expect(isG50PdfUnavailable(new G50PdfError("old error"))).toBe(true);
  });
  it("does not hide caller errors", () => {
    expect(isG50PdfUnavailable(new G50PdfError("x", "forbidden", false))).toBe(false);
    expect(isG50PdfUnavailable(new G50PdfError("x", "bad_request", false))).toBe(false);
    expect(isG50PdfUnavailable(new Error("boom"))).toBe(false);
  });
});
