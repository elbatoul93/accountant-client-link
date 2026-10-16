// Persistence layer for the accountant dashboard.
// - Loads each collection from DB on mount.
// - Mirrors writes from React state to the DB (diff-based: insert/update/delete).
// - For shared/legal docs, uploads any base64 file blob to Storage and persists only the path.
// - Performs a one-time migration of existing localStorage rows into the DB.

import { supabase } from "@/integrations/supabase/client";
import { toIsoDay, todayIso } from "@/lib/isoDate";
import type { WorkflowStatus } from "@/lib/portal";
import { toUuid } from "@/features/accountant/lib/businessStore";
import { LANG_STORAGE_KEY, loadTranslations, type Lang } from "@/lib/i18n";
import { toast } from "sonner";

const BUCKET = "client-uploads";
const MIGRATION_FLAG = "mgmtk_db_migrated_v1";

// ============ App-side shapes (kept identical to existing dashboard) ============

export interface Invoice {
  id: string; clientId: string; clientName: string;
  amount: number; date: string; status: "pending" | "processed" | "review";
}
export type DeclType = "G50" | "CNAS" | "CASNOS" | "CACOBATPH" | "TAP" | "IBS" | "FS" | "G12" | "CP";
export interface Decl {
  id: string; clientId: string; clientName: string;
  type: DeclType; amount: number; due: string;
  status: "upcoming" | "filed" | "overdue";
}
export interface FinStmt {
  id: string; clientId: string; clientName: string; year: string;
  assets: number; liabilities: number; equity: number; revenue: number; netResult: number;
  createdAt: string;
}
export interface SharedDoc {
  id: string; clientId: string; clientName: string; clientEmail: string;
  type: "G50" | "CNAS" | "FS" | "OTHER"; label: string; date: string;
  payload?: string; fileName?: string; mimeType?: string; fileData?: string;
  signedAt?: string; signedBy?: string; signatureDataUrl?: string;
  workflow?: WorkflowStatus;
  filePath?: string; // internal: storage path
}
export interface LegalDoc {
  id: string; clientId: string; label: string;
  kind: "RC" | "NIF" | "NIS" | "STATUTS" | "OTHER";
  fileName?: string; mimeType?: string; fileData?: string; date: string;
  filePath?: string;
}

// ============ Helpers ============

const dataUrlToBlob = (dataUrl: string): Blob | null => {
  try {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!m) return null;
    const [, mime, b64] = m;
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch { return null; }
};

const signedUrl = async (path: string): Promise<string | undefined> => {
  if (!path) return undefined;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl;
};

const uploadIfDataUrl = async (
  fileData: string | undefined,
  folder: "accountant-shared" | "accountant-legal",
  accountantId: string,
  clientRef: string,
  fileName: string | undefined,
): Promise<string | undefined> => {
  if (!fileData || !fileData.startsWith("data:")) return undefined;
  const blob = dataUrlToBlob(fileData);
  if (!blob) return undefined;
  const safeName = (fileName || "file").replace(/[^\w.-]+/g, "_");
  const path = `${folder}/${accountantId}/${clientRef}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type, upsert: false,
  });
  if (error) {
    console.error("[accountantStore] storage upload failed", error);
    return undefined;
  }
  return path;
};

// ============ LOAD ============

export const loadInvoices = async (accId: string): Promise<Invoice[]> => {
  const { data, error } = await supabase.from("acc_invoices")
    .select("*").eq("accountant_id", accId).order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id, clientId: r.client_ref, clientName: r.client_name,
    amount: Number(r.amount), date: r.invoice_date,
    status: r.status as Invoice["status"],
  }));
};

export const loadDecls = async (accId: string): Promise<Decl[]> => {
  const { data, error } = await supabase.from("acc_declarations")
    .select("*").eq("accountant_id", accId).order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id, clientId: r.client_ref, clientName: r.client_name,
    type: r.decl_type as DeclType, amount: Number(r.amount),
    due: r.due_date ?? "", status: r.status as Decl["status"],
  }));
};

const toFs = (r: any): FinStmt => ({
  id: r.id, clientId: r.client_ref, clientName: r.client_name, year: r.fiscal_year,
  assets: Number(r.assets), liabilities: Number(r.liabilities), equity: Number(r.equity),
  revenue: Number(r.revenue), netResult: Number(r.net_result), createdAt: r.created_at,
});

export const loadFsList = async (accId: string): Promise<FinStmt[]> => {
  const { data, error } = await supabase.from("acc_financial_statements")
    .select("*").eq("accountant_id", accId).order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(toFs);
};

export const loadSharedDocs = async (accId: string): Promise<SharedDoc[]> => {
  const { data, error } = await supabase.from("acc_shared_documents")
    .select("*").eq("accountant_id", accId).order("created_at", { ascending: false });
  if (error || !data) return [];
  const rows: SharedDoc[] = [];
  for (const r of data) {
    const fileData = r.file_path ? await signedUrl(r.file_path) : undefined;
    rows.push({
      id: r.id, clientId: r.client_ref, clientName: r.client_name, clientEmail: r.client_email ?? "",
      type: r.doc_type as SharedDoc["type"], label: r.label, date: r.doc_date ?? r.created_at,
      payload: r.payload ?? undefined, fileName: r.file_name ?? undefined,
      mimeType: r.mime_type ?? undefined, fileData,
      signedAt: r.signed_at ?? undefined, signedBy: r.signed_by ?? undefined,
      signatureDataUrl: r.signature_data_url ?? undefined,
      workflow: (r.workflow as WorkflowStatus | null) ?? undefined,
      filePath: r.file_path ?? undefined,
    });
  }
  return rows;
};

export const loadLegalDocs = async (accId: string): Promise<LegalDoc[]> => {
  const { data, error } = await supabase.from("acc_legal_documents")
    .select("*").eq("accountant_id", accId).order("created_at", { ascending: false });
  if (error || !data) return [];
  const rows: LegalDoc[] = [];
  for (const r of data) {
    const fileData = r.file_path ? await signedUrl(r.file_path) : undefined;
    rows.push({
      id: r.id, clientId: r.client_ref, label: r.label,
      kind: r.kind as LegalDoc["kind"],
      fileName: r.file_name ?? undefined, mimeType: r.mime_type ?? undefined, fileData,
      date: r.doc_date ?? r.created_at,
      filePath: r.file_path ?? undefined,
    });
  }
  return rows;
};

// ============ SYNC (diff prev vs next, apply changes to DB) ============

/** Throw when a Supabase write failed so callers can tell the user instead of losing edits silently. */
const must = (res: { error: { message: string } | null }) => {
  if (!res.error) return;
  let lang: Lang = "en";
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "fr" || saved === "ar") lang = saved;
  } catch { /* storage unavailable */ }
  void loadTranslations(lang).then((d) => toast.error(d.sync_failed));
  throw new Error(res.error.message);
};

type Indexed<T extends { id: string }> = Map<string, T>;
const indexBy = <T extends { id: string }>(arr: T[]): Indexed<T> => {
  const m = new Map<string, T>();
  for (const x of arr) m.set(x.id, x);
  return m;
};

export const syncInvoices = async (prev: Invoice[], next: Invoice[], accId: string) => {
  const a = indexBy(prev), b = indexBy(next);
  const adds: Invoice[] = [], updates: Invoice[] = [], deletes: string[] = [];
  for (const [id, v] of b) { if (!a.has(id)) adds.push(v); else if (JSON.stringify(a.get(id)) !== JSON.stringify(v)) updates.push(v); }
  for (const id of a.keys()) if (!b.has(id)) deletes.push(id);
  if (adds.length) {
    must(await supabase.from("acc_invoices").insert(adds.map((x) => ({
      id: x.id, accountant_id: accId, client_ref: x.clientId, client_name: x.clientName,
      amount: x.amount, invoice_date: toIsoDay(x.date) ?? todayIso(), status: x.status,
    }))));
  }
  for (const x of updates) {
    must(await supabase.from("acc_invoices").update({
      client_ref: x.clientId, client_name: x.clientName, amount: x.amount,
      invoice_date: toIsoDay(x.date) ?? todayIso(), status: x.status,
    }).eq("id", x.id));
  }
  if (deletes.length) must(await supabase.from("acc_invoices").delete().in("id", deletes));
};

export const syncDecls = async (prev: Decl[], next: Decl[], accId: string) => {
  const a = indexBy(prev), b = indexBy(next);
  const adds: Decl[] = [], updates: Decl[] = [], deletes: string[] = [];
  for (const [id, v] of b) { if (!a.has(id)) adds.push(v); else if (JSON.stringify(a.get(id)) !== JSON.stringify(v)) updates.push(v); }
  for (const id of a.keys()) if (!b.has(id)) deletes.push(id);
  if (adds.length) {
    must(await supabase.from("acc_declarations").insert(adds.map((x) => ({
      id: x.id, accountant_id: accId, client_ref: x.clientId, client_name: x.clientName,
      decl_type: x.type, amount: x.amount, due_date: x.due || null, status: x.status,
    }))));
  }
  for (const x of updates) {
    must(await supabase.from("acc_declarations").update({
      client_ref: x.clientId, client_name: x.clientName, decl_type: x.type,
      amount: x.amount, due_date: x.due || null, status: x.status,
    }).eq("id", x.id));
  }
  if (deletes.length) must(await supabase.from("acc_declarations").delete().in("id", deletes));
};

export const syncFs = async (prev: FinStmt[], next: FinStmt[], accId: string) => {
  const a = indexBy(prev), b = indexBy(next);
  const adds: FinStmt[] = [], updates: FinStmt[] = [], deletes: string[] = [];
  for (const [id, v] of b) { if (!a.has(id)) adds.push(v); else if (JSON.stringify(a.get(id)) !== JSON.stringify(v)) updates.push(v); }
  for (const id of a.keys()) if (!b.has(id)) deletes.push(id);
  if (adds.length) {
    must(await supabase.from("acc_financial_statements").insert(adds.map((x) => ({
      id: x.id, accountant_id: accId, client_ref: x.clientId, client_name: x.clientName,
      fiscal_year: x.year, assets: x.assets, liabilities: x.liabilities,
      equity: x.equity, revenue: x.revenue, net_result: x.netResult,
    }))));
  }
  for (const x of updates) {
    must(await supabase.from("acc_financial_statements").update({
      client_ref: x.clientId, client_name: x.clientName, fiscal_year: x.year,
      assets: x.assets, liabilities: x.liabilities, equity: x.equity,
      revenue: x.revenue, net_result: x.netResult,
    }).eq("id", x.id));
  }
  if (deletes.length) must(await supabase.from("acc_financial_statements").delete().in("id", deletes));
};

export const syncShared = async (
  prev: SharedDoc[], next: SharedDoc[], accId: string,
  // Returns updated array with filePath/fileData (signed URL) replacing data: URLs after upload.
): Promise<SharedDoc[]> => {
  const a = indexBy(prev), b = indexBy(next);
  const adds: SharedDoc[] = [], updates: SharedDoc[] = [], deletes: string[] = [];
  for (const [id, v] of b) { if (!a.has(id)) adds.push(v); else if (JSON.stringify(a.get(id)) !== JSON.stringify(v)) updates.push(v); }
  for (const id of a.keys()) if (!b.has(id)) deletes.push(id);
  // Upload new files, replace fileData with signed url
  const replaced = new Map<string, SharedDoc>();
  for (const x of adds) {
    let filePath = x.filePath;
    let fileData = x.fileData;
    if (!filePath && fileData?.startsWith("data:")) {
      filePath = await uploadIfDataUrl(fileData, "accountant-shared", accId, x.clientId, x.fileName);
      if (filePath) fileData = await signedUrl(filePath);
    }
    const updated = { ...x, filePath, fileData };
    replaced.set(x.id, updated);
    must(await supabase.from("acc_shared_documents").insert([{
      id: x.id, accountant_id: accId, client_ref: x.clientId, client_name: x.clientName,
      client_email: x.clientEmail || null, doc_type: x.type, label: x.label,
      doc_date: toIsoDay(x.date),
      payload: x.payload ?? null, file_name: x.fileName ?? null, mime_type: x.mimeType ?? null,
      file_path: filePath ?? null, signed_at: x.signedAt ?? null, signed_by: x.signedBy ?? null,
      signature_data_url: x.signatureDataUrl ?? null,
      workflow: (x.workflow ?? null) as never,
    }] as never));
  }
  for (const x of updates) {
    let filePath = x.filePath;
    let fileData = x.fileData;
    if (!filePath && fileData?.startsWith("data:")) {
      filePath = await uploadIfDataUrl(fileData, "accountant-shared", accId, x.clientId, x.fileName);
      if (filePath) fileData = await signedUrl(filePath);
    }
    const updated = { ...x, filePath, fileData };
    replaced.set(x.id, updated);
    must(await supabase.from("acc_shared_documents").update({
      client_ref: x.clientId, client_name: x.clientName, client_email: x.clientEmail || null,
      doc_type: x.type, label: x.label,
      doc_date: toIsoDay(x.date),
      payload: x.payload ?? null, file_name: x.fileName ?? null, mime_type: x.mimeType ?? null,
      file_path: filePath ?? null, signed_at: x.signedAt ?? null, signed_by: x.signedBy ?? null,
      signature_data_url: x.signatureDataUrl ?? null,
      workflow: (x.workflow ?? null) as never,
    }).eq("id", x.id));
  }
  if (deletes.length) must(await supabase.from("acc_shared_documents").delete().in("id", deletes));
  return next.map((x) => replaced.get(x.id) ?? x);
};

export const syncLegal = async (
  prev: LegalDoc[], next: LegalDoc[], accId: string,
): Promise<LegalDoc[]> => {
  const a = indexBy(prev), b = indexBy(next);
  const adds: LegalDoc[] = [], updates: LegalDoc[] = [], deletes: string[] = [];
  for (const [id, v] of b) { if (!a.has(id)) adds.push(v); else if (JSON.stringify(a.get(id)) !== JSON.stringify(v)) updates.push(v); }
  for (const id of a.keys()) if (!b.has(id)) deletes.push(id);
  const replaced = new Map<string, LegalDoc>();
  for (const x of adds) {
    let filePath = x.filePath;
    let fileData = x.fileData;
    if (!filePath && fileData?.startsWith("data:")) {
      filePath = await uploadIfDataUrl(fileData, "accountant-legal", accId, x.clientId, x.fileName);
      if (filePath) fileData = await signedUrl(filePath);
    }
    const updated = { ...x, filePath, fileData };
    replaced.set(x.id, updated);
    must(await supabase.from("acc_legal_documents").insert({
      id: x.id, accountant_id: accId, client_ref: x.clientId, label: x.label, kind: x.kind,
      file_name: x.fileName ?? null, mime_type: x.mimeType ?? null, file_path: filePath ?? null,
      doc_date: toIsoDay(x.date),
    }));
  }
  for (const x of updates) {
    let filePath = x.filePath;
    let fileData = x.fileData;
    if (!filePath && fileData?.startsWith("data:")) {
      filePath = await uploadIfDataUrl(fileData, "accountant-legal", accId, x.clientId, x.fileName);
      if (filePath) fileData = await signedUrl(filePath);
    }
    const updated = { ...x, filePath, fileData };
    replaced.set(x.id, updated);
    must(await supabase.from("acc_legal_documents").update({
      client_ref: x.clientId, label: x.label, kind: x.kind,
      file_name: x.fileName ?? null, mime_type: x.mimeType ?? null, file_path: filePath ?? null,
      doc_date: toIsoDay(x.date),
    }).eq("id", x.id));
  }
  if (deletes.length) must(await supabase.from("acc_legal_documents").delete().in("id", deletes));
  return next.map((x) => replaced.get(x.id) ?? x);
};

// ============ CLIENT-SIDE READ (relies on RLS for client visibility) ============

// The client's own saved financial statements (RLS: "Client select own statements").
export const loadFsForClient = async (): Promise<FinStmt[]> => {
  const { data, error } = await supabase.from("acc_financial_statements")
    .select("*").order("fiscal_year", { ascending: false });
  if (error || !data) return [];
  return data.map(toFs);
};

export const loadSharedDocsForClient = async (): Promise<SharedDoc[]> => {
  const { data, error } = await supabase.from("acc_shared_documents")
    .select("*").order("created_at", { ascending: false });
  if (error || !data) return [];
  const rows: SharedDoc[] = [];
  for (const r of data) {
    const fileData = r.file_path ? await signedUrl(r.file_path) : undefined;
    rows.push({
      id: r.id, clientId: r.client_ref, clientName: r.client_name, clientEmail: r.client_email ?? "",
      type: r.doc_type as SharedDoc["type"], label: r.label, date: r.doc_date ?? r.created_at,
      payload: r.payload ?? undefined, fileName: r.file_name ?? undefined,
      mimeType: r.mime_type ?? undefined, fileData,
      signedAt: r.signed_at ?? undefined, signedBy: r.signed_by ?? undefined,
      signatureDataUrl: r.signature_data_url ?? undefined,
      workflow: (r.workflow as WorkflowStatus | null) ?? undefined,
      filePath: r.file_path ?? undefined,
    });
  }
  return rows;
};

export const signSharedDocDb = async (
  id: string, patch: { signatureDataUrl: string; signedAt: string; signedBy: string },
): Promise<void> => {
  const { error } = await supabase.from("acc_shared_documents").update({
    signature_data_url: patch.signatureDataUrl,
    signed_at: patch.signedAt,
    signed_by: patch.signedBy,
  }).eq("id", id);
  if (error) console.error("[accountantStore] sign update failed", error);
};

// ============ ONE-TIME MIGRATION FROM LOCALSTORAGE ============

const readLocal = <T,>(k: string): T[] => {
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : []; } catch { return []; }
};

export const migrateLocalToDb = async (accId: string): Promise<void> => {
  if (localStorage.getItem(MIGRATION_FLAG)) return;
  try {
    // Only migrate when DB is empty for this accountant — avoids duplicates.
    const { count: invCount } = await supabase.from("acc_invoices")
      .select("*", { count: "exact", head: true }).eq("accountant_id", accId);
    const { count: declCount } = await supabase.from("acc_declarations")
      .select("*", { count: "exact", head: true }).eq("accountant_id", accId);
    const { count: fsCount } = await supabase.from("acc_financial_statements")
      .select("*", { count: "exact", head: true }).eq("accountant_id", accId);
    const { count: sharedCount } = await supabase.from("acc_shared_documents")
      .select("*", { count: "exact", head: true }).eq("accountant_id", accId);
    const { count: legalCount } = await supabase.from("acc_legal_documents")
      .select("*", { count: "exact", head: true }).eq("accountant_id", accId);

    const localInvoices = readLocal<Invoice>("mgmtk_acc_invoices");
    const localDecls = readLocal<Decl>("mgmtk_acc_declarations");
    const localFs = readLocal<FinStmt>("mgmtk_acc_fs");
    const localShared = readLocal<SharedDoc>("mgmtk_acc_shared_docs");
    const localLegal = readLocal<LegalDoc>("mgmtk_acc_legal_docs");

    // Old browser data used ids like "INV-12345"; the row id columns are uuids, so re-key anything else
    // (client_ref values stay as they are, they are text).
    const rekey = <T extends { id: string }>(rows: T[]): T[] => rows.map((r) => ({ ...r, id: toUuid(r.id) }));
    if ((invCount ?? 0) === 0 && localInvoices.length) await syncInvoices([], rekey(localInvoices), accId);
    if ((declCount ?? 0) === 0 && localDecls.length) await syncDecls([], rekey(localDecls), accId);
    if ((fsCount ?? 0) === 0 && localFs.length) await syncFs([], rekey(localFs), accId);
    if ((sharedCount ?? 0) === 0 && localShared.length) await syncShared([], rekey(localShared), accId);
    if ((legalCount ?? 0) === 0 && localLegal.length) await syncLegal([], rekey(localLegal), accId);

    localStorage.setItem(MIGRATION_FLAG, "1");
  } catch (e) {
    console.error("[accountantStore] migration failed", e);
  }
};
