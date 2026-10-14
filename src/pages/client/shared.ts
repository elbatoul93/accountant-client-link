

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface Doc { id?: string; file_path?: string; name: string; size: string; date: string; status: "processed" | "pending" }

export type DeclType = "G50" | "CNAS" | "CASNOS" | "CACOBATPH" | "TAP" | "IBS" | "FS" | "G12" | "CP";

export type TaxRegime = "REEL" | "SIMPLIFIE" | "IFU";

export interface Decl { id: string; clientId: string; clientName: string; type: DeclType; amount: number; due: string; status: "upcoming" | "filed" | "overdue" }

export interface Invoice { id: string; clientId: string; clientName: string; amount: number; date: string; status: string }

export interface ClientRow { id: string; name: string; taxId: string; contact: string; taxRegime?: TaxRegime }

export interface SharedDoc {
  id: string; clientId: string; clientName: string; clientEmail: string;
  type: "G50" | "CNAS" | "FS" | "OTHER"; label: string; date: string;
  payload?: string; fileName?: string; mimeType?: string; fileData?: string;
  signatureDataUrl?: string; signedAt?: string; signedBy?: string;
  workflow?: "draft" | "review" | "sent" | "signed" | "filed";
}

export const REGIME_DECLS: Record<TaxRegime, DeclType[]> = {
  REEL:      ["G50", "TAP", "IBS", "FS"],
  SIMPLIFIE: ["G50", "TAP", "IBS", "FS"],
  IFU:       ["G12", "CP"],
};

export const regimeShort = (r?: TaxRegime) =>
  r === "REEL" ? "Réel" : r === "SIMPLIFIE" ? "Simplifié" : r === "IFU" ? "IFU" : "";

export const fmtDZD = (n: number) =>
  `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(n)} DA`;

export const safeParse = (s: string): Record<string, string> | undefined => {
  try { const o = JSON.parse(s); return typeof o === "object" && o ? o : undefined; } catch { return undefined; }
};
