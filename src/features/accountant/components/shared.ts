import { type WorkflowStatus } from "@/lib/portal";

export const fmtDZD = (n: number) =>
  `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(n)} DA`;

export type TaxRegime = "REEL" | "SIMPLIFIE" | "IFU";

export interface Client {
  id: string; name: string; company?: string;
  taxId: string; bp?: string; nis?: string; rc?: string;
  cnasNo?: string; casnosNo?: string; hasCacobatph?: boolean;
  email?: string; phone?: string; address?: string; legalForm?: string; activity?: string;
  direction?: string; commune?: string;
  taxRegime?: TaxRegime;
  contact: string; // legacy email used by client portal matching
  status: "active" | "review";
}

export interface Invoice { id: string; clientId: string; clientName: string; amount: number; date: string; status: "pending" | "processed" | "review" }

export type DeclType = "G50" | "CNAS" | "CASNOS" | "CACOBATPH" | "TAP" | "IBS" | "FS" | "G12" | "CP";

export interface Decl { id: string; clientId: string; clientName: string; type: DeclType; amount: number; due: string; status: "upcoming" | "filed" | "overdue" }

export const REGIME_DECLS: Record<TaxRegime, DeclType[]> = {
  REEL:      ["G50", "TAP", "IBS", "FS"],
  SIMPLIFIE: ["G50", "TAP", "IBS", "FS"],
  IFU:       ["G12", "CP"],
};

export const regimeLabelKey = (r?: TaxRegime) =>
  r === "REEL" ? "client_tax_regime_reel"
  : r === "SIMPLIFIE" ? "client_tax_regime_simplifie"
  : r === "IFU" ? "client_tax_regime_ifu" : "";

export const declLabelKey = (type: DeclType): string => {
  const map: Partial<Record<DeclType, string>> = {
    G50: "decl_type_g50", TAP: "decl_type_tap", IBS: "decl_type_ibs",
    FS: "decl_type_fs", G12: "decl_type_g12", CP: "decl_type_cp",
  };
  return map[type] || type;
};

export interface FinStmt { id: string; clientId: string; clientName: string; year: string; assets: number; liabilities: number; equity: number; revenue: number; netResult: number; createdAt: string }

export interface SharedDoc { id: string; clientId: string; clientName: string; clientEmail: string; type: "G50" | "CNAS" | "FS" | "OTHER"; label: string; date: string; payload?: string; fileName?: string; mimeType?: string; fileData?: string; signedAt?: string; signedBy?: string; signatureDataUrl?: string; workflow?: WorkflowStatus }

export interface LegalDoc { id: string; clientId: string; label: string; kind: "RC" | "NIF" | "NIS" | "STATUTS" | "OTHER"; fileName?: string; mimeType?: string; fileData?: string; date: string }

export type View = "dashboard" | "clients" | "invoices" | "obligations" | "tools" | "profile" | "payroll" | "billing" | "journal" | "reports" | "taxintel" | "liasse" | "assets" | "calendar" | "incoming" | "vault" | "tracking" | "chat";
