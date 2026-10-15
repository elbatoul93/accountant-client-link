import { describe, it, expect } from "vitest";
import { parseDateLoose, vaultFromShared, vaultFromInvoiceDocs, sortVault } from "@/lib/vault";

describe("vault", () => {
  it("parses ISO and French DD/MM/YYYY dates", () => {
    expect(parseDateLoose("2026-03-09T10:00:00Z")).toBe("2026-03-09T10:00:00.000Z");
    expect(parseDateLoose("9/3/2026")).toBe("2026-03-09T00:00:00.000Z");
    expect(parseDateLoose("31/12/2025")).toBe("2025-12-31T00:00:00.000Z");
  });
  it("falls back to now for an unreadable date", () => {
    const before = Date.now();
    const t = Date.parse(parseDateLoose("not a date"));
    expect(t).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(parseDateLoose(undefined))).toBeGreaterThanOrEqual(before - 1000);
  });
  it("maps shared documents with month key and signed flag", () => {
    const [e] = vaultFromShared([{ id: "1", label: "G50 mars", type: "G50", date: "15/03/2026", clientName: "A", signedAt: "2026-03-20" }]);
    expect(e).toMatchObject({ id: "sh_1", kind: "shared_doc", monthKey: "2026-03", signed: true, type: "G50" });
    expect(vaultFromShared([{ id: "2", label: "x", type: "FS", date: "2026-04-01", clientName: "A" }])[0].signed).toBe(false);
  });
  it("maps uploaded invoices", () => {
    const [e] = vaultFromInvoiceDocs([{ id: "9", fileName: "f.pdf", createdAt: "2026-05-02T08:00:00Z" }], "Client", "c@x.dz");
    expect(e).toMatchObject({ id: "in_9", kind: "incoming_invoice", monthKey: "2026-05", type: "INVOICE", clientEmail: "c@x.dz" });
  });
  it("sorts newest first without mutating the input", () => {
    const input = vaultFromInvoiceDocs([
      { id: "1", fileName: "a", createdAt: "2026-01-01T00:00:00Z" },
      { id: "2", fileName: "b", createdAt: "2026-03-01T00:00:00Z" },
    ], "C");
    expect(sortVault(input).map((x) => x.id)).toEqual(["in_2", "in_1"]);
    expect(input[0].id).toBe("in_1");
  });
});
