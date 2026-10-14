// Database persistence for the accountant/client portal data that used to live in localStorage
// (src/lib/portal.ts): notifications, monthly document checklist, upload reminders, and the
// client's uploaded documents/invoices. Chat already has its own realtime layer (RealtimeChat,
// public.messages). Needs migration 20261014231000_business_data_tables.sql.
//
// People are addressed by user id, not email: use `clientUserId` to resolve a client_ref first.

import { supabase } from "@/integrations/supabase/client";

type DbErr = { error: { message: string } | null };
const must = (res: DbErr) => { if (res.error) throw new Error(res.error.message); };

/* ---------------- notifications ---------------- */
export type NotificationType = "invoice_uploaded" | "g50_ready" | "doc_signed" | "info";
export interface PortalNotificationRow {
  id: string; type: NotificationType; title: string; message: string;
  link?: string; refId?: string; read: boolean; createdAt: string; senderId?: string;
}

export const loadNotifications = async (limit = 100): Promise<PortalNotificationRow[]> => {
  // RLS limits rows to the signed-in recipient.
  const { data, error } = await supabase.from("notifications").select("*")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, type: r.type as NotificationType, title: r.title, message: r.message,
    link: r.link ?? undefined, refId: r.ref_id ?? undefined, read: r.read,
    createdAt: r.created_at, senderId: r.sender_id ?? undefined,
  }));
};

export const sendNotification = async (n: {
  recipientId: string; title: string; message?: string; type?: NotificationType; link?: string; refId?: string;
}) => {
  const { data: au } = await supabase.auth.getUser();
  must(await supabase.from("notifications").insert({
    recipient_id: n.recipientId, sender_id: au.user?.id ?? null, type: n.type ?? "info",
    title: n.title.slice(0, 200), message: (n.message ?? "").slice(0, 2000),
    link: n.link?.startsWith("/") ? n.link : null, ref_id: n.refId ?? null,
  }));
};

export const markNotificationRead = async (id: string) =>
  must(await supabase.from("notifications").update({ read: true }).eq("id", id));

export const markAllNotificationsRead = async (userId: string) =>
  must(await supabase.from("notifications").update({ read: true }).eq("recipient_id", userId).eq("read", false));

/** Calls `cb` when a new notification row arrives for this user. Returns an unsubscribe function. */
export const subscribeNotifications = (userId: string, cb: () => void) => {
  const channel = supabase.channel(`notifications:${userId}`)
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, cb)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
};

/** The portal account linked to one of the accountant's clients (null until the client signs up). */
export const clientUserId = async (accId: string, clientRef: string): Promise<string | null> => {
  const { data, error } = await supabase.from("acc_clients").select("linked_user_id")
    .eq("accountant_id", accId).eq("client_ref", clientRef).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.linked_user_id ?? null;
};

/** For a client: the accountant they are linked to (notification recipient). */
export const myAccountantId = async (): Promise<string | null> => {
  const { data: au } = await supabase.auth.getUser();
  if (!au.user) return null;
  const { data, error } = await supabase.from("profiles").select("linked_accountant_id")
    .eq("user_id", au.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.linked_accountant_id ?? null;
};

/* ---------------- monthly document checklist ---------------- */
export type ChecklistKind = "SALES" | "PURCHASES" | "BANK" | "PAYROLL" | "EXPENSES" | "OTHER";
export type ChecklistStatus = "missing" | "received" | "validated";
export interface ChecklistRow {
  id: string; clientRef: string; monthKey: string; kind: ChecklistKind; status: ChecklistStatus;
  receivedAt?: string; refDocumentId?: string; note?: string;
}
export const DEFAULT_CHECKLIST_KINDS: ChecklistKind[] = ["SALES", "PURCHASES", "BANK", "PAYROLL", "EXPENSES"];

const checklistRow = (r: {
  id: string; client_ref: string; month_key: string; kind: string; status: string;
  received_at: string | null; ref_document_id: string | null; note: string | null;
}): ChecklistRow => ({
  id: r.id, clientRef: r.client_ref, monthKey: r.month_key, kind: r.kind as ChecklistKind,
  status: r.status as ChecklistStatus, receivedAt: r.received_at ?? undefined,
  refDocumentId: r.ref_document_id ?? undefined, note: r.note ?? undefined,
});

/** Accountant: all checklist rows for a month (optionally one client). Clients get their own rows via RLS. */
export const loadChecklist = async (monthKey: string, clientRef?: string): Promise<ChecklistRow[]> => {
  let q = supabase.from("acc_checklist").select("*").eq("month_key", monthKey);
  if (clientRef) q = q.eq("client_ref", clientRef);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(checklistRow);
};

/** Accountant: create the default rows for a client/month if missing (idempotent). */
export const ensureChecklist = async (accId: string, clientRef: string, monthKey: string) => {
  must(await supabase.from("acc_checklist").upsert(
    DEFAULT_CHECKLIST_KINDS.map((kind) => ({ accountant_id: accId, client_ref: clientRef, month_key: monthKey, kind })),
    { onConflict: "accountant_id,client_ref,month_key,kind", ignoreDuplicates: true },
  ));
};

/** Accountant: any status. A client can only flip a `missing` row to `received` (enforced by the database). */
export const setChecklistStatus = async (id: string, status: ChecklistStatus, refDocumentId?: string) =>
  must(await supabase.from("acc_checklist").update({
    status, received_at: status === "missing" ? null : new Date().toISOString(),
    ref_document_id: refDocumentId ?? null,
  }).eq("id", id));

/* ---------------- upload reminders ---------------- */
export const loadRemindersSent = async (accId: string, monthKey: string): Promise<Set<string>> => {
  const { data, error } = await supabase.from("acc_reminders_sent").select("client_ref")
    .eq("accountant_id", accId).eq("month_key", monthKey);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.client_ref));
};

/** Returns false when this client was already reminded this month (nothing inserted). */
export const markReminderSent = async (accId: string, clientRef: string, monthKey: string): Promise<boolean> => {
  const { data, error } = await supabase.from("acc_reminders_sent")
    .upsert({ accountant_id: accId, client_ref: clientRef, month_key: monthKey },
      { onConflict: "accountant_id,client_ref,month_key", ignoreDuplicates: true })
    .select("client_ref");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
};

/* ---------------- client documents and incoming invoices (public.documents) ---------------- */
export type DocKind = "document" | "invoice";
export type DocStatus = "pending" | "processed" | "review";
export interface ClientDocumentRow {
  id: string; userId: string; kind: DocKind; status: DocStatus; title: string; description?: string;
  fileName: string; filePath: string; mimeType?: string; size?: number; note?: string; createdAt: string;
}

/** A client's own uploads, or (accountant) the uploads of one linked client by user id. */
export const loadDocuments = async (userId: string, kind?: DocKind): Promise<ClientDocumentRow[]> => {
  let q = supabase.from("documents").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, userId: r.user_id, kind: r.kind as DocKind, status: r.status as DocStatus, title: r.title,
    description: r.description ?? undefined, fileName: r.file_name, filePath: r.file_path,
    mimeType: r.mime_type ?? undefined, size: r.size ?? undefined, note: r.note ?? undefined, createdAt: r.created_at,
  }));
};

/** Accountant triage: only status and note can be changed on a client's document. */
export const setDocumentStatus = async (id: string, status: DocStatus, note?: string) =>
  must(await supabase.from("documents").update({ status, ...(note !== undefined ? { note } : {}) }).eq("id", id));

/** Client: delete an own upload (row; the caller removes the storage object). */
export const deleteDocument = async (id: string) => must(await supabase.from("documents").delete().eq("id", id));

/* ---------------- one-time import of old reminder log ---------------- */
export const importLocalReminders = async (accId: string, emailToClientRef: Map<string, string>) => {
  const flag = `mgmtk_portal_imported_${accId}`;
  try {
    if (localStorage.getItem(flag)) return;
    const log = JSON.parse(localStorage.getItem("mgmtk_portal_reminders_sent") || "{}") as Record<string, boolean>;
    for (const key of Object.keys(log)) {
      const idx = key.indexOf(":");
      const ref = emailToClientRef.get(key.slice(idx + 1).toLowerCase());
      if (ref) await markReminderSent(accId, ref, key.slice(0, idx));
    }
    localStorage.setItem(flag, "1");
  } catch { /* old log is best effort */ }
};
