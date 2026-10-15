

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface Doc { id?: string; file_path?: string; name: string; size: string; date: string; status: "processed" | "pending" }

// One definition of these shared shapes and helpers (the accountant side owns them).
export type { DeclType, TaxRegime, Decl, Invoice, SharedDoc } from "@/pages/accountant/shared";
export { REGIME_DECLS, fmtDZD } from "@/pages/accountant/shared";
import type { TaxRegime } from "@/pages/accountant/shared";

export interface ClientRow { id: string; name: string; taxId: string; contact: string; taxRegime?: TaxRegime }

export const regimeShort = (r?: TaxRegime) =>
  r === "REEL" ? "Réel" : r === "SIMPLIFIE" ? "Simplifié" : r === "IFU" ? "IFU" : "";

export const safeParse = (s: string): Record<string, string> | undefined => {
  try { const o = JSON.parse(s); return typeof o === "object" && o ? o : undefined; } catch { return undefined; }
};
