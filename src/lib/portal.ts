// Shared portal storage: notifications, incoming client invoices, and signature helpers.
// All values live in localStorage so both Accountant and Client portals see the same data.

export type NotifRole = "accountant" | "client";

export interface PortalNotification {
  id: string;
  forRole: NotifRole;
  forEmail?: string;          // when targeted at a specific client
  fromName?: string;
  title: string;
  message: string;
  link?: string;              // route to open
  type?: "invoice_uploaded" | "g50_ready" | "doc_signed" | "info";
  read: boolean;
  createdAt: string;          // ISO
  refId?: string;             // e.g. SharedDoc id or Invoice id
}

export interface IncomingInvoice {
  id: string;
  clientEmail: string;
  clientName: string;
  fileName: string;
  mimeType: string;
  fileData?: string;          // dataURL
  size: number;
  uploadedAt: string;         // ISO
  status: "pending" | "processed" | "review";
  note?: string;
}

const KEY_NOTIF = "mgmtk_portal_notifications";
const KEY_INCOMING = "mgmtk_portal_incoming_invoices";

const read = <T,>(k: string): T[] => {
  try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; }
};
const write = <T,>(k: string, v: T[]) => localStorage.setItem(k, JSON.stringify(v));

// Lightweight pub-sub so different mounted views refresh in real time
const bus = new EventTarget();
export const onPortalChange = (cb: () => void) => {
  const h = () => cb();
  bus.addEventListener("change", h);
  window.addEventListener("storage", h);
  return () => {
    bus.removeEventListener("change", h);
    window.removeEventListener("storage", h);
  };
};
const ping = () => bus.dispatchEvent(new Event("change"));

/* -------- Notifications -------- */
export const getNotifications = (forRole: NotifRole, forEmail?: string): PortalNotification[] => {
  const all = read<PortalNotification>(KEY_NOTIF);
  return all
    .filter((n) => n.forRole === forRole && (!forEmail || !n.forEmail || n.forEmail.toLowerCase() === forEmail.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
export const pushNotification = (n: Omit<PortalNotification, "id" | "createdAt" | "read">) => {
  const all = read<PortalNotification>(KEY_NOTIF);
  all.unshift({ ...n, id: crypto.randomUUID(), createdAt: new Date().toISOString(), read: false });
  write(KEY_NOTIF, all.slice(0, 200));
  ping();
};
export const markNotificationRead = (id: string) => {
  const all = read<PortalNotification>(KEY_NOTIF).map((n) => (n.id === id ? { ...n, read: true } : n));
  write(KEY_NOTIF, all); ping();
};
export const markAllRead = (forRole: NotifRole, forEmail?: string) => {
  const all = read<PortalNotification>(KEY_NOTIF).map((n) => {
    if (n.forRole !== forRole) return n;
    if (forEmail && n.forEmail && n.forEmail.toLowerCase() !== forEmail.toLowerCase()) return n;
    return { ...n, read: true };
  });
  write(KEY_NOTIF, all); ping();
};

/* -------- Incoming invoices (client → accountant) -------- */
export const getIncomingInvoices = (): IncomingInvoice[] =>
  read<IncomingInvoice>(KEY_INCOMING).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
export const addIncomingInvoice = (inv: Omit<IncomingInvoice, "id" | "uploadedAt" | "status">) => {
  const all = read<IncomingInvoice>(KEY_INCOMING);
  const created: IncomingInvoice = {
    ...inv, id: crypto.randomUUID(), uploadedAt: new Date().toISOString(), status: "pending",
  };
  all.unshift(created);
  write(KEY_INCOMING, all); ping();
  return created;
};
export const updateIncomingStatus = (id: string, status: IncomingInvoice["status"]) => {
  const all = read<IncomingInvoice>(KEY_INCOMING).map((x) => (x.id === id ? { ...x, status } : x));
  write(KEY_INCOMING, all); ping();
};
export const deleteIncomingInvoice = (id: string) => {
  write(KEY_INCOMING, read<IncomingInvoice>(KEY_INCOMING).filter((x) => x.id !== id));
  ping();
};

/* -------- Shared docs signature (accountant → client G50, etc.) --------
   We piggy-back on the existing `mgmtk_acc_shared_docs` array used by both dashboards
   and add a `signature`/`signedAt` field. */
const KEY_SHARED = "mgmtk_acc_shared_docs";
export interface SignedSharedDocPatch {
  signatureDataUrl: string;
  signedAt: string;
  signedBy: string;
}
export const signSharedDoc = (id: string, patch: SignedSharedDocPatch) => {
  const all: any[] = read<any>(KEY_SHARED);
  const next = all.map((s) => (s.id === id ? { ...s, ...patch } : s));
  write(KEY_SHARED, next); ping();
};

/* -------- Vault helpers -------- */
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
  raw: any;
}
const monthKey = (iso: string) => iso.slice(0, 7);
export const getVault = (filter?: { clientEmail?: string }): VaultEntry[] => {
  const incoming = read<IncomingInvoice>(KEY_INCOMING);
  const shared = read<any>(KEY_SHARED);
  const a: VaultEntry[] = incoming
    .filter((i) => !filter?.clientEmail || i.clientEmail.toLowerCase() === filter.clientEmail.toLowerCase())
    .map((i) => ({
      id: `in_${i.id}`, kind: "incoming_invoice",
      date: i.uploadedAt, monthKey: monthKey(i.uploadedAt),
      label: i.fileName, type: "INVOICE",
      clientName: i.clientName, clientEmail: i.clientEmail, raw: i,
    }));
  const b: VaultEntry[] = shared
    .filter((s: any) => !filter?.clientEmail || s.clientEmail?.toLowerCase() === filter.clientEmail.toLowerCase())
    .map((s: any) => {
      const iso = parseDateLoose(s.date);
      return {
        id: `sh_${s.id}`, kind: "shared_doc" as const,
        date: iso, monthKey: monthKey(iso),
        label: s.label, type: s.type, signed: !!s.signedAt,
        clientName: s.clientName, clientEmail: s.clientEmail, raw: s,
      };
    });
  return [...a, ...b].sort((x, y) => y.date.localeCompare(x.date));
};
function parseDateLoose(d: string): string {
  // Existing shared docs use fr-DZ "DD/MM/YYYY" — try to normalise.
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d).toISOString();
  const m = d?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`).toISOString();
  return new Date().toISOString();
}
