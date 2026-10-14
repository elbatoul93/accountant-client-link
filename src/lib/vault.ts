// Document vault: a month-by-month archive built from data that already lives in the database
// (documents shared by the accountant and invoices uploaded by clients).

export interface VaultEntry {
  id: string;
  kind: "incoming_invoice" | "shared_doc";
  date: string;          // ISO
  monthKey: string;      // YYYY-MM
  label: string;
  type: string;          // INVOICE / G50 / CNAS / FS / OTHER
  clientName: string;
  clientEmail?: string;
  signed?: boolean;
}

const monthKey = (iso: string) => iso.slice(0, 7);

/** Shared documents store their date as ISO or as fr-DZ "DD/MM/YYYY". */
export const parseDateLoose = (d: string | undefined): string => {
  if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d).toISOString();
  const m = d?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`).toISOString();
  return new Date().toISOString();
};

interface SharedLike {
  id: string; label: string; type: string; date: string;
  clientName: string; clientEmail?: string; signedAt?: string;
}

export const vaultFromShared = (docs: SharedLike[]): VaultEntry[] =>
  docs.map((s) => {
    const iso = parseDateLoose(s.date);
    return {
      id: `sh_${s.id}`, kind: "shared_doc", date: iso, monthKey: monthKey(iso),
      label: s.label, type: s.type, signed: !!s.signedAt,
      clientName: s.clientName, clientEmail: s.clientEmail,
    };
  });

interface InvoiceDocLike { id: string; fileName: string; createdAt: string }

export const vaultFromInvoiceDocs = (rows: InvoiceDocLike[], clientName: string, clientEmail?: string): VaultEntry[] =>
  rows.map((r) => ({
    id: `in_${r.id}`, kind: "incoming_invoice", date: r.createdAt, monthKey: monthKey(r.createdAt),
    label: r.fileName, type: "INVOICE", clientName, clientEmail,
  }));

export const sortVault = (entries: VaultEntry[]) => [...entries].sort((a, b) => b.date.localeCompare(a.date));
