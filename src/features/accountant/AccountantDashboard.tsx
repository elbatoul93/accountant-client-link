import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadInvoices, loadDecls, loadFsList, loadSharedDocs, loadLegalDocs, syncInvoices, syncDecls, syncFs, syncShared, syncLegal, migrateLocalToDb } from "@/features/accountant/lib/accountantStore";
import { importLocalBusinessData, loadClients, syncClients, type ClientRecord } from "@/features/accountant/lib/businessStore";
import { loadRemindersSent, markReminderSent, sendNotification } from "@/lib/portalStore";
import { sortVault, vaultFromInvoiceDocs, vaultFromShared } from "@/lib/vault";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { removeClientsWithRecords } from "@/features/accountant/lib/exampleData";
import { OnboardingChecklist, buildSampleData, isDemoClient } from "@/features/accountant/components/Onboarding";
import { SubscriptionBanner } from "@/features/billing/SubscriptionBanner";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, FileText, Bell, Receipt, ShieldCheck, Plus, FileDown, Wrench, BookOpen, Calculator, Send, LayoutDashboard, Building2, Upload, FileCheck2, Wallet, Landmark, ListChecks, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDeleteDialog } from "@/features/accountant/components/ConfirmDeleteDialog";
import { toast } from "sonner";
import { pluralKey } from "@/lib/format";
import { BillingView, JournalView, useSuiteData, aggregateForG50, precompteKey } from "./components/SuiteModules";
import { prevPeriod } from "@/lib/accounting/algerianTax";
import { PayrollAdvanced } from "./components/PayrollAdvanced";
import { ReportsView } from "./components/ReportsView";
import { TaxIntelView } from "./components/TaxIntelView";
import { LiasseFiscaleView } from "./components/LiasseFiscale";
import { AssetsView } from "./components/AssetsView";
import { FiscalCalendar } from "@/components/common/FiscalCalendar";
import { finalizePayrollRun } from "@/features/accountant/lib/payrollStore";
import { lockPeriod, computeG50FromJournal } from "@/lib/accounting/engine";
import { ClientInviteManager } from "@/features/accountant/components/ClientInviteManager";
import { IncomingDocumentsLive } from "@/features/accountant/components/IncomingDocumentsLive";
import { Archive, Inbox as InboxIcon } from "lucide-react";
import { generateG50PdfBytes, isG50PdfUnavailable } from "@/features/accountant/lib/g50Export";
import { copyToClipboard } from "@/lib/clipboard";
import { Client, Decl, FinStmt, Invoice, LegalDoc, SharedDoc, TaxRegime, View, fmtDZD } from "@/features/accountant/components/shared";
import { EmptyState, ToolCard } from "@/features/accountant/components/ui";
import { AddClientDialog, AddInvoiceDialog, LockDialog } from "@/features/accountant/components/ClientDialogs";
import { ClientsListView, DashboardView, InvoiceTable } from "@/features/accountant/components/OverviewViews";
import { AccountantVaultView, ChatHubView, TrackingView } from "@/features/accountant/components/InboxViews";
import { ClientProfileView } from "@/features/accountant/components/ClientProfileView";
import { G50GeneratorDialog } from "@/features/accountant/components/G50GeneratorDialog";
import { AddDeclarationDialog, DeclList, EditDeclDialog, FinancialStatementsDialog, SendDocumentDialog } from "@/features/accountant/components/DeclarationDialogs";

const AccountantDashboard = () => {
  const { t, user, lang } = useApp();
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [decls, setDecls] = useState<Decl[]>([]);
  const [fsList, setFsList] = useState<FinStmt[]>([]);
  const [sharedDocs, setSharedDocs] = useState<SharedDoc[]>([]);
  const [legalDocs, setLegalDocs] = useState<LegalDoc[]>([]);
  // Map of `${clientId}|YYYY-MM` -> { id, sent, formData } from g50_declarations
  // Latest client-ref -> portal user id lookup, for callbacks created before the linked clients load.
  const userIdOfRef = useRef<(clientId: string) => string>((id) => id);
  const [g50Map, setG50Map] = useState<Record<string, { id: string; sent: boolean; formData: any }>>({});
  const [sendingDeclId, setSendingDeclId] = useState<string | null>(null);

  const refreshG50Map = useCallback(async () => {
    const { data: au } = await supabase.auth.getUser();
    const accId = au.user?.id;
    if (!accId) return;
    const { data, error } = await supabase
      .from("g50_declarations")
      .select("id, client_id, month, year, form_data, sent")
      .eq("accountant_id", accId);
    if (error || !data) { toast.error(t("load_failed"), { id: "load-failed" }); return; }
    const map: Record<string, { id: string; sent: boolean; formData: any }> = {};
    for (const r of data as any[]) {
      const key = `${r.client_id}|${String(r.year).padStart(4, "0")}-${String(r.month).padStart(2, "0")}`;
      map[key] = { id: r.id, sent: !!r.sent, formData: r.form_data };
    }
    // Keep a "sent" mark the app already set, so a slow refresh never un-sends a declaration.
    setG50Map((prev) => {
      for (const k of Object.keys(map)) if (prev[k]?.sent) map[k].sent = true;
      return map;
    });
  }, []);
  useEffect(() => { refreshG50Map(); }, [refreshG50Map]);

  // Send a G50 declaration to the linked client:
  // 1) update g50_declarations.sent=true,sent_at, 2) generate PDF, 3) upload to shared-docs storage,
  // 4) insert into shared_documents. Source of truth for "sent" is the DB (g50Map).
  const handleSendG50 = useCallback(async (d: Decl, clientName: string, taxId: string | undefined, bp: string | undefined) => {
    if (sendingDeclId) return;
    const period = d.due.slice(0, 7); // YYYY-MM
    const [yyyy, mm] = period.split("-");
    const key = `${userIdOfRef.current(d.clientId)}|${period}`;
    const g50 = g50Map[key];
    if (!g50) {
      toast.error(t("g50_send_no_pdf") || "Generate the G50 first before sending.");
      return;
    }
    if (g50.sent) return;
    setSendingDeclId(d.id);
    try {
      const { data: au } = await supabase.auth.getUser();
      const accId = au.user?.id;
      if (!accId) throw new Error("Not authenticated");

      // 1) Build PDF bytes from the persisted form data
      const fileName = `G50_${taxId || "NIF"}_${yyyy}_${mm}.pdf`;
      const pdfBytes = await generateG50PdfBytes({ ...(g50.formData as any), fileName });

      // 2) Upload to storage at {client_id}/{g50_declaration_id}.pdf
      const path = `${d.clientId}/${g50.id}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("shared-docs")
        .upload(path, new Blob([pdfBytes as BlobPart], { type: "application/pdf" }), {
          contentType: "application/pdf", upsert: true,
        });
      if (upErr) throw upErr;

      // 3) Insert shared_documents row
      const title = `G50 — ${mm}/${yyyy}`;
      const { error: insErr } = await supabase.from("shared_documents" as any).insert({
        client_id: userIdOfRef.current(d.clientId),
        accountant_id: accId,
        g50_declaration_id: g50.id,
        file_path: path,
        title,
      } as any);
      if (insErr) throw insErr;

      // 4) Mark as sent
      const { error: updErr } = await supabase
        .from("g50_declarations")
        .update({ sent: true, sent_at: new Date().toISOString() } as any)
        .eq("id", g50.id);
      if (updErr) throw updErr;

      setG50Map((m) => ({ ...m, [key]: { ...g50, sent: true } }));
      toast.success(t("g50_sent_success") || "G50 sent to client");
    } catch (e: any) {
      console.error("[handleSendG50]", e);
      if (isG50PdfUnavailable(e)) {
        // The PDF service is down: nothing was sent, and the Excel file is not a substitute for the client's copy.
        toast.error(t("g50_send_pdf_unavailable"), {
          duration: 15000,
          action: { label: t("g50_send_retry"), onClick: () => void sendG50Ref.current?.(d, clientName, taxId, bp) },
        });
      } else {
        toast.error(e?.message || t("g50_send_failed") || "Failed to send G50");
      }
    } finally {
      setSendingDeclId(null);
    }
  }, [g50Map, sendingDeclId, t]);
  const sendG50Ref = useRef(handleSendG50);
  sendG50Ref.current = handleSendG50;

  
  const [obligationsClient, setObligationsClient] = useState<Client | null>(null);
  const [openTool, setOpenTool] = useState<null | "fs" | "g50" | "send">(null);
  const [editG50, setEditG50] = useState<{ id: string; formData: any } | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  // Secure edit flow: clicking Edit triggers a password lock; on success the form opens.
  const [pendingEditClient, setPendingEditClient] = useState<Client | null>(null);
  // Destructive list actions wait here until the user confirms.
  const [confirmDelete, setConfirmDelete] = useState<(() => void) | null>(null);
  const askDelete = (action: () => void) => setConfirmDelete(() => action);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingShared, setEditingShared] = useState<SharedDoc | null>(null);
  const [trackingClientId, setTrackingClientId] = useState<string>("");
  
  const [chatPreselectId, setChatPreselectId] = useState<string | null>(null);
  type DbLinkedClient = {
    id: string; full_name: string;
    direction: string | null; commune: string | null; bp: string | null;
    company: string | null; email: string | null; phone: string | null; address: string | null;
    legal_form: string | null; activity: string | null; tax_regime: string | null;
    tax_id: string | null; nis: string | null; rc: string | null;
    cnas_no: string | null; casnos_no: string | null; has_cacobatph: boolean | null;
  };
  const [dbLinkedClients, setDbLinkedClients] = useState<DbLinkedClient[]>([]);

  // keepBaseId: the clients state is keyed by acc_clients.client_ref, so a matched client keeps
  // its own id. The G50/chat flows address clients by portal user id (d.id) instead.
  const dbToClient = (d: DbLinkedClient, base?: Client, keepBaseId = false): Client => {
    const seed: Client = base
      ? { ...base, id: keepBaseId ? base.id : d.id }
      : { id: d.id, name: (d.full_name && d.full_name.trim()) || "Unknown", taxId: "", contact: "", status: "active" };
    return {
      ...seed,
      name: (d.full_name && d.full_name.trim()) || seed.name,
      direction: d.direction ?? seed.direction,
      commune: d.commune ?? seed.commune,
      bp: d.bp ?? seed.bp,
      company: d.company ?? seed.company,
      email: d.email ?? seed.email,
      phone: d.phone ?? seed.phone,
      address: d.address ?? seed.address,
      legalForm: d.legal_form ?? seed.legalForm,
      activity: d.activity ?? seed.activity,
      taxRegime: (d.tax_regime as TaxRegime) ?? seed.taxRegime,
      taxId: d.tax_id ?? seed.taxId,
      nis: d.nis ?? seed.nis,
      rc: d.rc ?? seed.rc,
      cnasNo: d.cnas_no ?? seed.cnasNo,
      casnosNo: d.casnos_no ?? seed.casnosNo,
      hasCacobatph: d.has_cacobatph ?? seed.hasCacobatph,
      contact: d.email ?? seed.contact,
    };
  };

  // Fetch live linked clients from DB. Authoritative source — always refreshed on mount/login.
  const mergeDbIntoClients = (db: DbLinkedClient[]) => {
    setClients((prev) => {
      const byName = new Map(prev.map((c) => [c.name.trim().toLowerCase(), c]));
      const byEmail = new Map(prev.filter((c) => c.email || c.contact).map((c) => [(c.email || c.contact).toLowerCase(), c]));
      const used = new Set<string>();
      const merged: Client[] = db.map((d) => {
        const base = (d.email ? byEmail.get(d.email.toLowerCase()) : undefined) ?? byName.get((d.full_name || "").trim().toLowerCase());
        if (base) used.add(base.id);
        return dbToClient(d, base, true);
      });
      for (const c of prev) {
        if (!used.has(c.id)) merged.push(c);
      }
      return merged;
    });
  };
  const refetchLinkedClients = async () => {
    const { data, error } = await supabase.rpc("get_linked_client_names");
    if (!error && data) {
      const list = data as typeof dbLinkedClients;
      setDbLinkedClients(list);
      mergeDbIntoClients(list);
    }
  };
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.rpc("get_linked_client_names");
      if (cancelled || error || !data) return;
      const list = data as typeof dbLinkedClients;
      setDbLinkedClients(list);
      mergeDbIntoClients(list);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) load();
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge DB-linked clients with local client metadata by name match.
  // All profile fields (direction, commune, bp, NIF, NIS, RC, regime, etc.) are sourced from the DB profile (authoritative).
  const g50Clients = useMemo<Client[]>(() => {
    if (dbLinkedClients.length === 0) return clients;
    const byName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c]));
    const merged: Client[] = dbLinkedClients.map((d) =>
      dbToClient(d, byName.get(d.full_name.trim().toLowerCase())),
    );
    const dbNames = new Set(dbLinkedClients.map((d) => d.full_name.trim().toLowerCase()));
    for (const c of clients) {
      if (!dbNames.has(c.name.trim().toLowerCase())) merged.push(c);
    }
    return merged;
  }, [dbLinkedClients, clients]);

  // The clients state is keyed by acc_clients.client_ref; g50_declarations, chat and notifications
  // address the portal account (user id). Match a client to its portal account by email, then name.
  const linkedFor = (clientId: string): DbLinkedClient | undefined => {
    const direct = dbLinkedClients.find((d) => d.id === clientId);
    if (direct) return direct;
    const c = clients.find((x) => x.id === clientId);
    if (!c) return undefined;
    const em = (c.email || c.contact || "").toLowerCase();
    return (em ? dbLinkedClients.find((d) => (d.email || "").toLowerCase() === em) : undefined)
      ?? dbLinkedClients.find((d) => (d.full_name || "").trim().toLowerCase() === c.name.trim().toLowerCase());
  };
  const userIdOf = (clientId: string): string => linkedFor(clientId)?.id ?? clientId;
  userIdOfRef.current = userIdOf;

  // Example clients (current and older ids) go out through the database child-first, because deleting a client
  // that still has records is refused; the screen is updated only once that worked.
  const removeExampleData = async (only?: string) => {
    const accId = accIdRef.current;
    const refs = clients.filter((c) => (only ? c.id === only : isDemoClient(c.id))).map((c) => c.id);
    if (!accId || !refs.length) return;
    try {
      await removeClientsWithRecords(accId, refs);
    } catch (e) {
      console.error("[remove example data]", e);
      toast.error(t("i18n_error_generic"));
      return;
    }
    const gone = (id?: string) => !!id && refs.includes(id);
    setInvoices((p) => p.filter((x) => !gone(x.clientId)));
    setDecls((p) => p.filter((x) => !gone(x.clientId)));
    setFsList((p) => p.filter((x) => !gone(x.clientId)));
    setSharedDocs((p) => p.filter((x) => !gone(x.clientId)));
    setLegalDocs((p) => p.filter((x) => !gone(x.clientId)));
    // The database removed these through the cascade; drop them from the open screens too.
    setEmployees((p) => p.filter((x) => !gone(x.clientId)));
    setBills((p) => p.filter((x) => !gone(x.clientId)));
    setJournal((p) => p.filter((x) => !gone(x.clientId)));
    setLocks((p) => p.filter((x) => !gone(x.clientId)));
    setPrecompte((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !refs.some((r) => k.startsWith(`${r}__`)))));
    setClients((p) => p.filter((x) => !gone(x.id)));
    toast.success(t("acc_deleted"));
  };

  const refOfUser = (userId: string): string => {
    if (clients.some((c) => c.id === userId)) return userId;
    const d = dbLinkedClients.find((x) => x.id === userId);
    if (!d) return userId;
    const em = (d.email || "").toLowerCase();
    const c = (em ? clients.find((x) => (x.email || x.contact || "").toLowerCase() === em) : undefined)
      ?? clients.find((x) => x.name.trim().toLowerCase() === (d.full_name || "").trim().toLowerCase());
    return c?.id ?? userId;
  };

  // Persist all editable client business fields to the linked client's profile (if matched in DB).
  const persistClientProfileFields = async (c: Client) => {
    const match = dbLinkedClients.find(
      (d) => d.id === c.id || d.full_name.trim().toLowerCase() === c.name.trim().toLowerCase(),
    );
    if (!match) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        direction: c.direction ?? null,
        commune: c.commune ?? null,
        bp: c.bp ?? null,
        company: c.company ?? null,
        phone: c.phone ?? null,
        address: c.address ?? null,
        legal_form: c.legalForm ?? null,
        activity: c.activity ?? null,
        tax_regime: c.taxRegime ?? null,
        tax_id: c.taxId || null,
        nis: c.nis ?? null,
        rc: c.rc ?? null,
        cnas_no: c.cnasNo ?? null,
        casnos_no: c.casnosNo ?? null,
        has_cacobatph: !!c.hasCacobatph,
      })
      .eq("user_id", match.id);
    if (!error) await refetchLinkedClients();
  };

  // === DB persistence: load on mount + diff-sync on every change ===
  const accIdRef = useRef<string | null>(null);
  const dbReadyRef = useRef(false);
  const prevClientsRef = useRef<Client[]>([]);
  const clientsReadyRef = useRef(false);
  const [clientsReady, setClientsReady] = useState(false);
  const { employees, setEmployees, bills, setBills, journal, setJournal, locks, setLocks, precompte, setPrecompte } = useSuiteData(clientsReady);
  const prevInvoicesRef = useRef<typeof invoices>([]);
  const prevDeclsRef = useRef<typeof decls>([]);
  const prevFsRef = useRef<typeof fsList>([]);
  const prevSharedRef = useRef<typeof sharedDocs>([]);
  const prevLegalRef = useRef<typeof legalDocs>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
      const { data } = await supabase.auth.getUser();
      const accId = data.user?.id;
      if (!accId || cancelled) return;
      accIdRef.current = accId;
      try {
        // One-time upload of this browser's old local data (clients, employees, bills, journal, assets).
        // Clients go first: invoices and the other documents reference them.
        await importLocalBusinessData(accId);
      } catch (e) {
        console.error("[import local data]", e);
      }
      await migrateLocalToDb(accId);
      const [inv, dec, fs, sh, lg, cl] = await Promise.all([
        loadInvoices(accId), loadDecls(accId), loadFsList(accId),
        loadSharedDocs(accId), loadLegalDocs(accId),
        loadClients(accId).catch(() => null),
      ]);
      if (cancelled) return;
      if (cl) {
        prevClientsRef.current = cl as Client[];
        setClients(cl as Client[]);
        clientsReadyRef.current = true;
        setClientsReady(true);
        refetchLinkedClients(); // merge portal-linked clients into the loaded list
      } else {
        toast.error(t("load_failed"), { id: "load-failed" });
      }
      prevInvoicesRef.current = inv; prevDeclsRef.current = dec; prevFsRef.current = fs;
      prevSharedRef.current = sh as typeof sharedDocs; prevLegalRef.current = lg as typeof legalDocs;
      setInvoices(inv); setDecls(dec); setFsList(fs);
      setSharedDocs(sh as typeof sharedDocs); setLegalDocs(lg as typeof legalDocs);
      dbReadyRef.current = true;
      } catch (e) {
        // Nothing is written back until a load has succeeded, so tell the accountant instead of showing empty lists.
        console.error("[dashboard load]", e);
        if (!cancelled) toast.error(t("load_failed"), { id: "load-failed", duration: 15000 });
      }
    };
    run();
    // Sign-in events also fire when the tab regains focus or the token refreshes:
    // only reload when a different account signs in, or edits made meanwhile would be overwritten.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user && session.user.id !== accIdRef.current) {
        dbReadyRef.current = false;
        run();
      }
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!clientsReadyRef.current || !accIdRef.current) return;
    const prev = prevClientsRef.current;
    prevClientsRef.current = clients;
    syncClients(prev as unknown as ClientRecord[], clients as unknown as ClientRecord[], accIdRef.current).catch((e) => {
      console.error("[sync clients]", e);
      if (/foreign key|23503|violates/i.test(String(e?.message ?? e))) {
        // The delete was refused: put the removed clients back so the screen matches the database.
        const kept = new Set(clients.map((c) => c.id));
        const restored = prev.filter((c) => !kept.has(c.id));
        prevClientsRef.current = [...clients, ...restored];
        setClients((cur) => [...cur, ...restored]);
        toast.error(t("acc_delete_has_records"));
        return;
      }
      toast.error(t("i18n_error_generic"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  useEffect(() => {
    if (!dbReadyRef.current || !accIdRef.current) return;
    const prev = prevInvoicesRef.current;
    prevInvoicesRef.current = invoices;
    syncInvoices(prev, invoices, accIdRef.current).catch(async (e) => {
      console.error("[sync invoices]", e);
      const fresh = await loadInvoices(accIdRef.current!).catch(() => null);
      if (fresh) { prevInvoicesRef.current = fresh; setInvoices(fresh); }
    });
  }, [invoices]);

  useEffect(() => {
    if (!dbReadyRef.current || !accIdRef.current) return;
    const prev = prevDeclsRef.current;
    prevDeclsRef.current = decls;
    syncDecls(prev, decls, accIdRef.current).catch(async (e) => {
      console.error("[sync decls]", e);
      const fresh = await loadDecls(accIdRef.current!).catch(() => null);
      if (fresh) { prevDeclsRef.current = fresh; setDecls(fresh); }
    });
  }, [decls]);

  useEffect(() => {
    if (!dbReadyRef.current || !accIdRef.current) return;
    const prev = prevFsRef.current;
    prevFsRef.current = fsList;
    syncFs(prev, fsList, accIdRef.current).catch(async (e) => {
      console.error("[sync fs]", e);
      const fresh = await loadFsList(accIdRef.current!).catch(() => null);
      if (fresh) { prevFsRef.current = fresh; setFsList(fresh); }
    });
  }, [fsList]);

  useEffect(() => {
    if (!dbReadyRef.current || !accIdRef.current) return;
    const prev = prevSharedRef.current;
    prevSharedRef.current = sharedDocs;
    syncShared(prev, sharedDocs, accIdRef.current)
      .then((updated) => {
        // Replace any data: URLs with signed URLs after upload, without retriggering DB writes.
        const changed = updated.some((u, i) => u.fileData !== sharedDocs[i]?.fileData || u.filePath !== (sharedDocs[i] as any)?.filePath);
        if (changed) {
          prevSharedRef.current = updated as typeof sharedDocs;
          setSharedDocs(updated as typeof sharedDocs);
        }
      })
      .catch(async (e) => {
        console.error("[sync shared]", e);
        const fresh = await loadSharedDocs(accIdRef.current!).catch(() => null);
        if (fresh) { prevSharedRef.current = fresh; setSharedDocs(fresh); }
      });
  }, [sharedDocs]);

  useEffect(() => {
    if (!dbReadyRef.current || !accIdRef.current) return;
    const prev = prevLegalRef.current;
    prevLegalRef.current = legalDocs;
    syncLegal(prev, legalDocs, accIdRef.current)
      .then((updated) => {
        const changed = updated.some((u, i) => u.fileData !== legalDocs[i]?.fileData || u.filePath !== (legalDocs[i] as any)?.filePath);
        if (changed) {
          prevLegalRef.current = updated as typeof legalDocs;
          setLegalDocs(updated as typeof legalDocs);
        }
      })
      .catch(async (e) => {
        console.error("[sync legal]", e);
        const fresh = await loadLegalDocs(accIdRef.current!).catch(() => null);
        if (fresh) { prevLegalRef.current = fresh; setLegalDocs(fresh); }
      });
  }, [legalDocs]);


  const totalRevenue = invoices.reduce((s, i) => s + (i.status === "processed" ? i.amount : 0), 0);
  const pendingInvoices = invoices.filter((i) => i.status === "pending").length;
  const pendingTax = decls.filter((d) => d.status !== "filed").length;

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.company, c.taxId, c.bp, c.nis, c.rc, c.email, c.phone].some((v) => v?.toLowerCase().includes(q))
    );
  }, [clients, search]);

  // Per-client employee count (drives CNAS frequency: <10 quarterly, ≥10 monthly)
  const empCountByClient = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of employees) {
      const k = e.clientId || "_unassigned";
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [employees]);

  // Automated reminder for clients who have not uploaded by the 10th of the month.
  // Idempotent per (client, month): the database records who was already reminded.
  useEffect(() => {
    if (!clientsReady || !dbLinkedClients.length) return;
    let cancelled = false;
    const sweep = async () => {
      const now = new Date();
      const accId = accIdRef.current;
      if (now.getDate() < 10 || !accId) return;
      try {
        const month = now.toISOString().slice(0, 7);
        const [already, uploads] = await Promise.all([
          loadRemindersSent(accId, month),
          supabase.from("documents").select("user_id").gte("created_at", `${month}-01`),
        ]);
        const uploaded = new Set((uploads.data ?? []).map((r) => r.user_id));
        let sent = 0;
        for (const c of clients) {
          const link = linkedFor(c.id);
          if (cancelled || !link || already.has(c.id) || uploaded.has(link.id)) continue;
          if (!(await markReminderSent(accId, c.id, month))) continue;
          await sendNotification({
            recipientId: link.id,
            title: t("reminder_title"),
            message: t("reminder_msg", { month }),
            link: "/dashboard/client",
          });
          sent++;
        }
        if (sent > 0 && !cancelled) toast.message(t(pluralKey("toast_reminders_sent", sent, lang), { n: sent }));
      } catch (e) {
        console.error("[reminders]", e);
      }
    };
    sweep();
    // run again every hour while the dashboard stays open
    const id = setInterval(sweep, 60 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientsReady, dbLinkedClients, clients]);


  const activeClient = activeClientId ? clients.find((c) => c.id === activeClientId) || null : null;

  const openProfile = (c: Client) => {
    setActiveClientId(c.id);
    setView("profile");
  };

  // Recompute unread badge whenever portal data changes
  const [unreadMsgs, setUnreadMsgs] = useState<number>(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const { data: au } = await supabase.auth.getUser();
      if (!au.user) return;
      const { count } = await supabase.from("messages").select("id", { count: "exact", head: true })
        .eq("receiver_id", au.user.id).eq("is_read", false);
      if (!cancelled) setUnreadMsgs(count ?? 0);
    };
    refresh();
    const channel = supabase.channel("messages-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  // Vault: shared documents plus the invoices clients uploaded (RLS limits both to this accountant's clients).
  const [invoiceDocs, setInvoiceDocs] = useState<{ id: string; fileName: string; createdAt: string; userId: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    supabase.from("documents").select("id,file_name,created_at,user_id").eq("kind", "invoice")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { toast.error(t("load_failed"), { id: "load-failed" }); return; }
        setInvoiceDocs((data ?? []).map((r) => ({ id: r.id, fileName: r.file_name, createdAt: r.created_at, userId: r.user_id })));
      });
    return () => { cancelled = true; };
  }, []);
  const vault = useMemo(() => sortVault([
    ...vaultFromShared(sharedDocs),
    ...invoiceDocs.flatMap((d) => {
      const link = dbLinkedClients.find((x) => x.id === d.userId);
      return vaultFromInvoiceDocs([d], link?.full_name || "", link?.email ?? undefined);
    }),
  ]), [sharedDocs, invoiceDocs, dbLinkedClients]);

  // Live count of incoming documents (same source as the IncomingDocumentsLive feed).
  // RLS already restricts visibility to documents owned by clients linked to this accountant.
  const [incomingLiveCount, setIncomingLiveCount] = useState<number>(0);
  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true });
      if (!cancelled) setIncomingLiveCount(count ?? 0);
    };
    fetchCount();
    const channel = supabase
      .channel("documents-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents" },
        () => fetchCount(),
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  // 5 main sections — "Judge-friendly" simplified architecture
  const sidebarGroups: { label: string; items: { key: View; label: string; icon: any; count?: number; badge?: number }[] }[] = [
    {
      label: t("nav_group_dashboard"),
      items: [
        { key: "dashboard", label: t("side_dashboard"), icon: LayoutDashboard },
        { key: "calendar", label: t("side_calendar"), icon: Bell },
      ],
    },
    {
      label: t("nav_group_documents"),
      items: [
        { key: "incoming", label: t("side_incoming"), icon: InboxIcon, count: incomingLiveCount },
        { key: "tracking", label: t("side_tracking"), icon: ListChecks },
        { key: "vault", label: t("side_vault"), icon: Archive, count: vault.length },
        { key: "clients", label: t("side_clients"), icon: Users, count: clients.length },
        { key: "invoices", label: t("side_invoices"), icon: FileText, count: invoices.length },
      ],
    },
    {
      label: t("nav_group_payroll"),
      items: [
        { key: "payroll", label: t("side_payroll"), icon: Wallet, count: employees.length },
        { key: "assets", label: t("side_assets"), icon: Building2 },
      ],
    },
    {
      label: t("nav_group_taxdecl"),
      items: [
        { key: "obligations", label: t("side_obligations"), icon: Receipt, count: decls.length },
        { key: "taxintel", label: t("side_taxintel"), icon: Landmark },
        { key: "liasse", label: t("side_liasse"), icon: FileCheck2 },
        { key: "journal", label: t("side_journal"), icon: BookOpen, count: journal.length },
        { key: "reports", label: t("side_reports"), icon: Calculator },
        { key: "billing", label: t("side_billing"), icon: Receipt, count: bills.length },
        { key: "tools", label: t("side_tools"), icon: Wrench },
      ],
    },
    {
      label: t("nav_group_messages"),
      items: [
        { key: "chat", label: t("side_chat"), icon: MessageCircle, badge: unreadMsgs },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <SiteHeader />
      <div className="container py-6">
        <SubscriptionBanner t={t} />
        <div className="grid lg:grid-cols-[240px_1fr] gap-6">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 self-start">
            <Card className="p-3 shadow-card">
              <Button
                variant="gold"
                className="w-full justify-start mb-3"
                onClick={() => setOpenAdd(true)}
              >
                <Plus className="h-4 w-4" /> {t("acc_new_client")}
              </Button>
              {/* Phones: one compact picker instead of a 20-item list above the content */}
              <div className="lg:hidden">
                <Select
                  value={view === "profile" ? "clients" : view}
                  onValueChange={(v) => { setView(v as View); if (v !== "clients") setActiveClientId(null); }}
                >
                  <SelectTrigger aria-label={t("nav_go_to")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sidebarGroups.map((grp) => (
                      <SelectGroup key={grp.label}>
                        <SelectLabel>{grp.label}</SelectLabel>
                        {grp.items.map((it) => (
                          <SelectItem key={it.key} value={it.key}>{it.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <nav className="hidden lg:block space-y-3">
                {sidebarGroups.map((grp) => (
                  <div key={grp.label}>
                    <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gold-deep/80">
                      {grp.label}
                    </div>
                    <div className="space-y-1">
                      {grp.items.map((it) => {
                        const active = view === it.key || (it.key === "clients" && view === "profile");
                        const Icon = it.icon;
                        return (
                          <button
                            key={it.key}
                            onClick={() => { setView(it.key); if (it.key !== "clients") setActiveClientId(null); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-smooth ${
                              active
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="flex-1 text-start">{it.label}</span>
                            {typeof it.badge === "number" && it.badge > 0 && (
                              <span className="h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                                {it.badge}
                              </span>
                            )}
                            {typeof it.count === "number" && (
                              <Badge variant="secondary" className={`text-[10px] ${active ? "bg-primary-foreground/20 text-primary-foreground border-0" : ""}`}>
                                {it.count}
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </Card>

            <Card className="p-4 mt-3 bg-linear-to-br from-gold/10 to-card border-gold/30 shadow-card">
              <div className="text-xs text-muted-foreground mb-1">{user?.name}</div>
              <div className="text-xs font-semibold text-gold-deep">{t("auth_role_accountant")}</div>
            </Card>
          </aside>

          {/* Main */}
          <main className="space-y-6 min-w-0">
            {view === "dashboard" && clientsReady && (
              <OnboardingChecklist
                t={t} clients={clients} invoices={invoices} decls={decls}
                hasProfile={!!(user?.name && user?.company)}
                hasInvitedClient={dbLinkedClients.length > 0}
                onAddClient={() => setOpenAdd(true)}
                onGoClients={() => setView("clients")}
                onGoObligations={() => setView("obligations")}
                onAddSample={() => {
                  const { client, invoice } = buildSampleData();
                  setClients((p) => (p.some((c) => c.id === client.id) ? p : [...p, client]));
                  setInvoices((p) => [...p, invoice]);
                }}
                onRemoveSample={() => removeExampleData()}
              />
            )}
            {view === "dashboard" && (
              <DashboardView
                t={t} user={user} clients={clients} invoices={invoices} decls={decls}
                totalRevenue={totalRevenue} pendingInvoices={pendingInvoices} pendingTax={pendingTax}
                onGoClients={() => setView("clients")}
                onAddClient={() => setOpenAdd(true)}
                onOpenCalendar={() => setView("calendar")}
              />
            )}

            {view === "calendar" && (
              <div className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold text-primary">{t("fcal_title")}</h1>
                  <p className="text-xs text-muted-foreground">{t("fcal_subtitle")}</p>
                </div>
                <FiscalCalendar t={t} limit={30} />
              </div>
            )}

            {view === "incoming" && (
              <IncomingDocumentsLive t={t} />
            )}

            {view === "tracking" && (
              <TrackingView t={t} clients={clients} activeId={trackingClientId} setActiveId={setTrackingClientId} />
            )}

            {view === "chat" && (
              <ChatHubView t={t} preselectId={chatPreselectId} />
            )}

            {view === "vault" && (
              <AccountantVaultView t={t} entries={vault} />
            )}

            {view === "clients" && (
              <div className="space-y-4">
                <ClientInviteManager />
                <ClientsListView
                  t={t} clients={filteredClients} totalCount={clients.length}
                  search={search} setSearch={setSearch}
                  empCountByClient={empCountByClient}
                  onOpen={openProfile}
                  onAdd={() => setOpenAdd(true)}
                  onEdit={(c) => setEditingClient(c)}
                  onMessage={async (c) => {
                    try {
                      const { data: auth } = await supabase.auth.getUser();
                      const accId = auth.user?.id;
                      if (!accId) return;
                      const targetEmail = (c.email || c.contact || "").toLowerCase();
                      let clientUserId: string | null = null;
                      const dbMatch = dbLinkedClients.find((d) => d.id === c.id);
                      if (dbMatch) clientUserId = dbMatch.id;
                      if (!clientUserId && targetEmail) {
                        const { data } = await supabase
                          .from("profiles")
                          .select("user_id")
                          .eq("email", targetEmail)
                          .eq("linked_accountant_id", accId)
                          .maybeSingle();
                        if (data?.user_id) clientUserId = data.user_id;
                      }
                      if (!clientUserId) {
                        toast.error(t("acc_client_inactive"));
                        return;
                      }
                      setChatPreselectId(clientUserId);
                      setView("chat");
                    } catch (e: any) {
                      toast.error(e?.message || t("i18n_error_generic"));
                    }
                  }}
                  onDelete={(id) => {
                    // The database refuses to delete a client that still has records, so say so up front.
                    if (isDemoClient(id)) { askDelete(() => removeExampleData(id)); return; }
                    const hasRecords = invoices.some((x) => x.clientId === id) || decls.some((x) => x.clientId === id)
                      || fsList.some((x) => x.clientId === id)
                      || legalDocs.some((x) => x.clientId === id) || sharedDocs.some((x) => x.clientId === id);
                    if (hasRecords) { toast.error(t("acc_delete_has_records")); return; }
                    askDelete(() => {
                      setClients((p) => p.filter((x) => x.id !== id));
                      toast.success(t("acc_deleted"));
                    });
                  }}
                  onExtract={setObligationsClient}
                  
                  onCopyInvite={async (c) => {
                    try {
                      const { data: { user: au } } = await supabase.auth.getUser();
                      if (!au) { toast.error(t("i18n_not_authenticated")); return; }
                      const targetEmail = (c.email || c.contact || "").toLowerCase() || null;
                      let token: string | null = null;
                      if (targetEmail) {
                        const { data: existing } = await supabase
                          .from("invitations")
                          .select("token, expires_at, is_used")
                          .eq("accountant_id", au.id)
                          .eq("email", targetEmail)
                          .eq("is_used", false)
                          .gt("expires_at", new Date().toISOString())
                          .order("created_at", { ascending: false })
                          .limit(1)
                          .maybeSingle();
                        if (existing?.token) token = existing.token;
                      }
                      if (!token) {
                        const arr = new Uint8Array(18);
                        crypto.getRandomValues(arr);
                        const newToken = Array.from(arr, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
                        const { error } = await supabase.from("invitations").insert({
                          token: newToken,
                          accountant_id: au.id,
                          email: targetEmail,
                          prefill_name: c.name?.trim() || null,
                          prefill_company: c.company?.trim() || null,
                          prefill_commune: c.commune?.trim() || null,
                          prefill_direction: c.direction?.trim() || null,
                          prefill_bp: c.bp?.trim() || null,
                        });
                        if (error) { toast.error(error.message); return; }
                        token = newToken;
                      }
                      const url = `${window.location.origin}/invite/${token}`;
                      copyToClipboard(url);
                      toast.success(t("acc_invite_copied").replace("{name}", c.name));
                    } catch (e: any) {
                      toast.error(e?.message || t("i18n_error_generic"));
                    }
                  }}
                />
              </div>
            )}

            {view === "profile" && activeClient && (
              <ClientProfileView
                t={t} client={activeClient} userId={userIdOf(activeClient.id)}
                decls={decls.filter((d) => d.clientId === activeClient.id)}
                invoices={invoices.filter((i) => i.clientId === activeClient.id)}
                legalDocs={legalDocs.filter((d) => d.clientId === activeClient.id)}
                onBack={() => { setActiveClientId(null); setView("clients"); }}
                onAddLegal={(doc) => setLegalDocs((p) => [doc, ...p])}
                onDeleteLegal={(id) => setLegalDocs((p) => p.filter((x) => x.id !== id))}
                onAddDecl={(d) => setDecls((p) => [d, ...p])}
                onDeleteDecl={(id) => setDecls((p) => p.filter((x) => x.id !== id))}
                onExtract={() => setObligationsClient(activeClient)}
                onEdit={(c) => setEditingClient(c)}
                onEditG50={(d) => { setEditG50(d); setOpenTool("g50"); }}
                onMessage={() => {
                  // Chat addresses the portal account (user id), known once the client has signed up.
                  const link = linkedFor(activeClient.id);
                  if (!link) {
                    toast.error(t("acc_client_inactive"));
                    return;
                  }
                  setChatPreselectId(link.id);
                  setView("chat");
                }}
              />
            )}

            {view === "invoices" && (
              <Card className="p-5 shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-primary">{t("dash_recent_invoices")}</h2>
                  <AddInvoiceDialog clients={clients} onAdd={(inv) => setInvoices((p) => [inv, ...p])} t={t} />
                </div>
                {invoices.length === 0 ? (
                  <EmptyState label={t("empty_no_invoices")} />
                ) : (
                  <InvoiceTable invoices={invoices} t={t} onDelete={(id) => askDelete(() => setInvoices((p) => p.filter((x) => x.id !== id)))} />
                )}
              </Card>
            )}

            {view === "obligations" && (
              <div className="grid lg:grid-cols-2 gap-5">
                <Card className="p-5 shadow-card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                        <Receipt className="h-4 w-4" /> {t("dash_g50_title")}
                      </h2>
                      <p className="text-xs text-muted-foreground">{t("dash_g50_subtitle")}</p>
                    </div>
                    <AddDeclarationDialog clients={clients} type="G50"
                      onAdd={(d) => setDecls((p) => [d, ...p])} t={t} />
                  </div>
                  <DeclList items={decls.filter((d) => d.type === "G50")} t={t}
                    onDelete={(id) => askDelete(() => setDecls((p) => p.filter((x) => x.id !== id)))}
                    onSend={(d) => {
                      const c = clients.find((x) => x.id === d.clientId);
                      handleSendG50(d, c?.name || d.clientName, c?.taxId, c?.bp);
                    }}
                    sentMap={Object.fromEntries(
                      decls.filter((d) => d.type === "G50").map((d) => {
                        const k = `${userIdOf(d.clientId)}|${d.due.slice(0, 7)}`;
                        return [d.id, !!g50Map[k]?.sent];
                      })
                    )}
                    sendingId={sendingDeclId}
                    sharedDocs={sharedDocs}
                    onReview={(s) => setEditingShared(s)}
                  />
                </Card>

                <Card className="p-5 shadow-card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" /> {t("dash_social_title")}
                      </h2>
                      <p className="text-xs text-muted-foreground">{t("dash_social_subtitle")}</p>
                    </div>
                    <AddDeclarationDialog clients={clients} type="CNAS"
                      onAdd={(d) => setDecls((p) => [d, ...p])} t={t} social />
                  </div>
                  <DeclList items={decls.filter((d) => d.type !== "G50")} t={t}
                    onDelete={(id) => askDelete(() => setDecls((p) => p.filter((x) => x.id !== id)))} showType />
                </Card>
              </div>
            )}

            {view === "tools" && (
              <Card className="p-5 shadow-card border-gold/30 bg-linear-to-br from-card to-gold/5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-gold-deep" /> {t("tools_title")}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mb-4">{t("tools_subtitle")}</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <ToolCard icon={BookOpen} title={t("tools_fs_title")} subtitle={t("tools_fs_subtitle")}
                    cta={t("tools_open")} onClick={() => setOpenTool("fs")} disabled={clients.length === 0} />
                  <ToolCard icon={Calculator} title={t("tools_g50_title")} subtitle={t("tools_g50_subtitle")}
                    cta={t("tools_open")} onClick={() => setOpenTool("g50")} />
                  <ToolCard icon={FileDown} title={t("tools_extract_title")} subtitle={t("tools_extract_subtitle")}
                    cta={t("acc_extract")} onClick={() => clients[0] && setObligationsClient(clients[0])}
                    disabled={clients.length === 0} />
                </div>
                {clients.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/60 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs text-muted-foreground">
                      {sharedDocs.length} document(s) shared with customers
                    </div>
                    <Button size="sm" variant="outlineGold" onClick={() => setOpenTool("send")}>
                      <Send className="h-3.5 w-3.5" /> {t("tools_send_to_client")}
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {view === "payroll" && (
              <PayrollAdvanced t={t} employees={employees} setEmployees={setEmployees}
                clients={clients.map((c) => ({ id: c.id, name: c.name, hasCacobatph: c.hasCacobatph }))}
                setJournal={setJournal} locks={locks} />
            )}
            {view === "billing" && (
              <BillingView t={t} bills={bills} setBills={setBills}
                clients={clients.map((c) => ({ id: c.id, name: c.name }))}
                journal={journal} setJournal={setJournal} locks={locks} />
            )}
            {view === "journal" && (
              <JournalView t={t} journal={journal} setJournal={setJournal}
                clients={clients.map((c) => ({ id: c.id, name: c.name }))} locks={locks} />
            )}
            {view === "reports" && (
              <ReportsView t={t} journal={journal} locks={locks} precompte={precompte}
                clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
            )}
            {view === "taxintel" && (
              <TaxIntelView t={t} journal={journal} bills={bills}
                precompte={precompte} setPrecompte={setPrecompte}
                clients={clients.map((c) => ({ id: c.id, name: c.name, legalForm: c.legalForm }))} />
            )}
            {view === "liasse" && (
              <LiasseFiscaleView t={t} journal={journal} employees={employees}
                clients={clients.map((c) => ({
                  id: c.id, name: c.name, taxId: c.taxId, nis: c.nis, rc: c.rc, bp: c.bp,
                  taxRegime: c.taxRegime,
                }))} />
            )}
            {view === "assets" && (
              <AssetsView t={t} clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
            )}
          </main>
        </div>
      </div>

      {/* Global dialogs */}
      <AddClientDialog open={openAdd} onOpenChange={setOpenAdd}
        onAdd={(c) => {
          setClients((p) => [c, ...p]);
          setOpenAdd(false);
          void persistClientProfileFields(c);
        }} t={t} />

      <ConfirmDeleteDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        onConfirm={() => { confirmDelete?.(); setConfirmDelete(null); }}
        t={t}
      />

      {/* Secure edit: password lock then edit form */}
      <LockDialog
        open={!!pendingEditClient}
        onOpenChange={(o) => { if (!o) setPendingEditClient(null); }}
        onUnlock={() => { setEditingClient(pendingEditClient); setPendingEditClient(null); }}
        t={t}
      />
      <AddClientDialog
        open={!!editingClient}
        onOpenChange={(o) => { if (!o) setEditingClient(null); }}
        onAdd={() => {}}
        mode="edit"
        initial={editingClient}
        onUpdate={(updated) => {
          setClients((p) => p.map((x) => (x.id === updated.id ? updated : x)));
          setEditingClient(null);
          void persistClientProfileFields(updated);
        }}
        t={t}
      />

      <FinancialStatementsDialog
        open={openTool === "fs"} onOpenChange={(o) => !o && setOpenTool(null)}
        clients={clients} t={t}
        onSave={(fs) => { setFsList((p) => [fs, ...p]); setOpenTool(null); }}
      />
      <G50GeneratorDialog
        open={openTool === "g50"} onOpenChange={(o) => { if (!o) { setOpenTool(null); setEditG50(null); } }}
        clients={g50Clients} t={t}
        // A G50 is stored against the portal account, so only clients that already have one can get it.
        isLinked={(cid) => dbLinkedClients.some((d) => d.id === cid)}
        editing={editG50}
        getAggregates={(cid) => aggregateForG50(refOfUser(cid), bills, employees)}
        getLiveG50={(cid, period) => computeG50FromJournal(journal, {
          clientId: cid ? refOfUser(cid) : undefined, period,
          precompteFromPrev: precompte[precompteKey(cid ? refOfUser(cid) : undefined, prevPeriod(period))] ?? 0,
        })}
        onGenerate={(d, shared, lockOpts) => {
          setDecls((p) => [{ ...d, clientId: refOfUser(d.clientId) }, ...p]);
          if (shared) {
            // The G50 dialog works with portal user ids; the rest of the dashboard uses client refs.
            setSharedDocs((p) => [{ ...shared, clientId: refOfUser(shared.clientId) }, ...p]);
            if (!linkedFor(refOfUser(shared.clientId)) && !linkedFor(shared.clientId)) {
              toast.error(t("send_client_not_linked"));
            } else {
              void sendNotification({
                recipientId: shared.clientId,
                title: t("notif_g50_ready_title"),
                message: t("notif_g50_ready_msg").replace("{label}", shared.label),
                type: "g50_ready",
                link: "/dashboard/client",
                refId: shared.id,
              }).catch((e) => { console.error("[notify]", e); toast.error(t("send_not_delivered")); });
            }
          }
          if (lockOpts) {
            // Period locks and payroll runs are keyed by client ref, like the journal; the dialog hands us the portal user id.
            const lockRef = { ...lockOpts, clientId: lockOpts.clientId ? refOfUser(lockOpts.clientId) : undefined };
            setLocks((p) => lockPeriod(p, lockRef));
            void finalizePayrollRun(lockRef.clientId, lockRef.period);
          }
          // The dialog has just saved the declaration; without this, "send" says "Generate the G50 first" until a reload.
          void refreshG50Map();
          setOpenTool(null);
          setEditG50(null);
        }}
      />
      <SendDocumentDialog
        open={openTool === "send"} onOpenChange={(o) => !o && setOpenTool(null)}
        clients={clients} t={t}
        onSend={(doc) => {
          if (!linkedFor(doc.clientId)) {
            toast.error(t("send_client_not_linked"));
            return false;
          }
          setSharedDocs((p) => [doc, ...p]);
          void sendNotification({
            recipientId: userIdOf(doc.clientId),
            title: t("notif_g50_ready_title"),
            message: t("notif_g50_ready_msg").replace("{label}", doc.label),
            type: "g50_ready",
            link: "/dashboard/client",
            refId: doc.id,
          }).catch((e) => { console.error("[notify]", e); toast.error(t("send_not_delivered")); });
          setOpenTool(null);
        }}
      />

      <Dialog open={!!obligationsClient} onOpenChange={(o) => !o && setObligationsClient(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("acc_obligations_title")} — {obligationsClient?.name}
            </DialogTitle>
          </DialogHeader>
          {obligationsClient && (() => {
            const cDecls = decls.filter((d) => d.clientId === obligationsClient.id);
            const cInvoices = invoices.filter((i) => i.clientId === obligationsClient.id);
            const totalDue = cDecls.filter((d) => d.status !== "filed").reduce((s, d) => s + d.amount, 0);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="text-xs text-muted-foreground">{t("acc_total_due")}</div>
                    <div className="text-xl font-bold text-gold-deep">{fmtDZD(totalDue)}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="text-xs text-muted-foreground">NIF</div>
                    <div className="font-mono text-sm">{obligationsClient.taxId}</div>
                  </div>
                </div>
                {cDecls.length === 0 ? (
                  <EmptyState label={t("acc_no_obligations")} />
                ) : (
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {cDecls.map((d) => (
                      <div key={d.id} className="flex items-center justify-between p-2.5 rounded border border-border/60">
                        <div>
                          <Badge variant="outline" className="font-mono text-[10px] me-2">{d.type}</Badge>
                          <span className="text-xs text-muted-foreground">{t("dash_deadline")}: {d.due}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{fmtDZD(d.amount)}</span>
                          <Badge variant="outline" className="text-[10px]">{t(`dash_${d.status}`)}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-xs text-muted-foreground border-t pt-2">
                  {cInvoices.length} {t("cli_invoices_received")}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Review & Edit declaration */}
      <EditDeclDialog
        doc={editingShared}
        onClose={() => setEditingShared(null)}
        onSave={(id, payload, label, workflow) => {
          setSharedDocs((p) => p.map((s) => (s.id === id ? { ...s, payload, label, workflow } : s)));
        }}
        t={t}
      />


    </div>
  );
};

export default AccountantDashboard;
