// Shared portal definitions: document checklist labels and the declaration workflow order.
// Persistence lives in the database (src/lib/portalStore.ts, accountantStore.ts); this file only
// holds the constants and types the UI shares.

/* ============================================================
   Monthly Document Checklist (required deliverables per client)
   ============================================================ */
export type DocChecklistKind = "SALES" | "PURCHASES" | "BANK" | "PAYROLL" | "EXPENSES" | "OTHER";
export interface DocChecklistDef {
  kind: DocChecklistKind;
  labelFr: string;
  labelAr: string;
}
export const DEFAULT_CHECKLIST: DocChecklistDef[] = [
  { kind: "SALES",     labelFr: "Factures de Ventes",     labelAr: "فواتير المبيعات" },
  { kind: "PURCHASES", labelFr: "Factures d'Achats",      labelAr: "فواتير المشتريات" },
  { kind: "BANK",      labelFr: "Relevés Bancaires",      labelAr: "كشوف البنك" },
  { kind: "PAYROLL",   labelFr: "États de Salaires",      labelAr: "كشوف الأجور" },
  { kind: "EXPENSES",  labelFr: "Notes de Frais",         labelAr: "مصاريف عامة" },
];

/* ============================================================
   Declaration Workflow Status (Draft → Filed)
   ============================================================ */
export type WorkflowStatus = "draft" | "review" | "sent" | "signed" | "filed";
export const WORKFLOW_ORDER: WorkflowStatus[] = ["draft", "review", "sent", "signed", "filed"];
