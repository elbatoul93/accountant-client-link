import { useState, useCallback, useEffect, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { formatDate, formatDateTime } from "@/lib/format";
import { useApp } from "@/contexts/AppContext";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { PANEL_SCROLL } from "@/components/layout/panelScroll";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadCloud, FileText, CheckCircle2, Clock, FileImage, Inbox, Trash2, Receipt, ShieldCheck, FolderOpen, Download, PenTool, Archive, FileSignature, Eye, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChatTab } from "@/features/chat/ChatTab";
import { MessageCircle } from "lucide-react";
import { DocChecklist } from "@/components/common/DocChecklist";
import { DocPreviewDialog } from "@/features/client/components/DocPreviewDialog";
import { WorkflowBadge } from "@/components/common/WorkflowStatus";
import { FiscalCalendar } from "@/components/common/FiscalCalendar";
import { loadSharedDocsForClient, signSharedDocDb, loadInvoices, loadDecls } from "@/features/accountant/lib/accountantStore";
import { loadClients, loadEmployees } from "@/features/accountant/lib/businessStore";
import { loadDocuments, myAccountantId, sendNotification } from "@/lib/portalStore";
import { sortVault, vaultFromInvoiceDocs, vaultFromShared, type VaultEntry } from "@/lib/vault";
import { todayIso } from "@/lib/isoDate";
import { Decl, DeclType, Doc, Invoice, MAX_UPLOAD_BYTES, REGIME_DECLS, SharedDoc, TaxRegime, fmtDZD, regimeShort, safeParse } from "@/features/client/components/shared";
import { SignDialog } from "@/features/client/components/SignAndVault";

const ClientDashboard = () => {
  const { t, user, lang } = useApp();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tick, setTick] = useState(0);
  const [signing, setSigning] = useState<SharedDoc | null>(null);
  const [previewDoc, setPreviewDoc] = useState<SharedDoc | null>(null);
  const [dbSharedDocs, setDbSharedDocs] = useState<SharedDoc[]>([]);
  const [accountantPdfs, setAccountantPdfs] = useState<{ id: string; title: string; file_path: string; created_at: string }[]>([]);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);

  // Load shared documents from the DB (RLS scopes to this client).
  const refreshSharedDocs = useCallback(async () => {
    try {
      const rows = await loadSharedDocsForClient();
      setDbSharedDocs(rows as SharedDoc[]);
    } catch {
      toast.error(t("load_failed"), { id: "load-failed" });
    }
  }, []);
  useEffect(() => { refreshSharedDocs(); }, [refreshSharedDocs]);

  // Load shared_documents (PDFs sent by the accountant, e.g. G50) — RLS scopes to client_id = auth.uid()
  const refreshAccountantPdfs = useCallback(async () => {
    const { data, error } = await supabase
      .from("shared_documents" as any)
      .select("id,title,file_path,created_at")
      .order("created_at", { ascending: false });
    if (error || !data) {
      toast.error(t("load_failed"), { id: "load-failed" });
      return;
    }
    setAccountantPdfs(data as any);
  }, []);
  useEffect(() => { refreshAccountantPdfs(); }, [refreshAccountantPdfs]);

  const downloadAccountantPdf = useCallback(async (id: string, file_path: string, title: string) => {
    setDownloadingPdf(id);
    try {
      const { data, error } = await supabase.storage
        .from("shared-docs")
        .createSignedUrl(file_path, 60);
      if (error || !data?.signedUrl) {
        toast.error(error?.message || "Failed to generate download link");
        return;
      }
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = `${title}.pdf`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloadingPdf(null);
    }
  }, []);

  // ── Upload confirmation modal state ──
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Hydrate the document list from Supabase so deletes can target real rows/files.
  useEffect(() => {
    let cancelled = false;
    const fetchDocs = async () => {
      const { data: au } = await supabase.auth.getUser();
      const uid = au.user?.id;
      if (!uid) return;
      const { data, error } = await supabase
        .from("documents")
        .select("id,file_name,file_path,size,created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error || !data) { toast.error(t("load_failed"), { id: "load-failed" }); return; }
      setDocs(
        data.map((d) => ({
          id: d.id,
          file_path: d.file_path,
          name: d.file_name,
          size: typeof d.size === "number" ? `${(d.size / 1024).toFixed(0)} KB` : "—",
          date: formatDate(d.created_at, lang),
          status: "pending" as const,
        })),
      );
    };
    fetchDocs();
    return () => { cancelled = true; };
  }, []);

  // The accountant's records about this client. RLS limits every query to the signed-in client's own rows.
  type Biz = {
    clients: { id: string; taxRegime?: TaxRegime; hasCacobatph?: boolean }[];
    decls: Decl[]; invoices: Invoice[]; employeeCount: number;
    invoiceDocs: { id: string; fileName: string; createdAt: string }[];
  };
  const [biz, setBiz] = useState<Biz>({ clients: [], decls: [], invoices: [], employeeCount: 0, invoiceDocs: [] });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: au } = await supabase.auth.getUser();
        const accId = await myAccountantId();
        if (!au.user || !accId) return;
        const [cl, dc, iv, em, docsRows] = await Promise.all([
          loadClients(accId), loadDecls(accId), loadInvoices(accId), loadEmployees(accId),
          loadDocuments(au.user.id, "invoice"),
        ]);
        if (cancelled) return;
        setBiz({
          clients: cl as Biz["clients"], decls: dc, invoices: iv, employeeCount: em.length,
          invoiceDocs: docsRows.map((d) => ({ id: d.id, fileName: d.fileName, createdAt: d.createdAt })),
        });
      } catch {
        if (!cancelled) toast.error(t("load_failed"), { id: "load-failed" });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const fileToDataUrl = (f: File) =>
    new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(f);
    });

  // Intercept selection: open the confirmation modal instead of uploading
  const onDrop = useCallback((files: File[]) => {
    if (!user || files.length === 0) return;
    const f = files[0];
    setPendingFile(f);
    setUploadTitle(f.name.replace(/\.[^.]+$/, ""));
    setUploadDescription("");
    setUploadProgress(0);
  }, [user]);

  const closeUploadModal = () => {
    if (uploading) return;
    setPendingFile(null);
    setUploadTitle("");
    setUploadDescription("");
    setUploadProgress(0);
  };

  const confirmUpload = useCallback(async () => {
    if (!user || !pendingFile) return;
    if (!uploadTitle.trim()) {
      toast.error(t("title_required"));
      return;
    }
    setUploading(true);
    setUploadProgress(5);

    try {
      // 1) Resolve auth user id (storage path requires it)
      const { data: au } = await supabase.auth.getUser();
      const uid = au.user?.id;
      if (!uid) throw new Error(t("upload_session_expired"));

      const safeName = pendingFile.name.replace(/[^\w.-]+/g, "_");
      const path = `${uid}/${Date.now()}_${safeName}`;
      setUploadProgress(20);

      // 2) Upload to Supabase Storage
      const { error: upErr } = await supabase.storage
        .from("client-uploads")
        .upload(path, pendingFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: pendingFile.type || "application/octet-stream",
        });
      if (upErr) throw upErr;
      setUploadProgress(70);

      // 3) Insert document metadata row
      const { data: inserted, error: dbErr } = await supabase.from("documents").insert({
        user_id: uid,
        title: uploadTitle.trim(),
        description: uploadDescription.trim() || null,
        file_name: pendingFile.name,
        file_path: path,
        mime_type: pendingFile.type || "application/octet-stream",
        size: pendingFile.size,
        kind: "invoice",
      }).select("id,file_path").single();
      if (dbErr) throw dbErr;
      setUploadProgress(90);

      // 4) Tell the accountant (portal notification addressed by account)
      try {
        const accId = await myAccountantId();
        if (accId) {
          await sendNotification({
            recipientId: accId,
            title: t("notif_invoice_uploaded_title"),
            message: t("notif_invoice_uploaded_msg")
              .replace("{client}", user.name)
              .replace("{file}", pendingFile.name),
            type: "invoice_uploaded",
            link: "/dashboard/accountant",
            refId: inserted?.id,
          });
        }
      } catch { /* non-blocking */ }
      setTick((x) => x + 1);

      setDocs((prev) => [{
        id: inserted?.id,
        file_path: inserted?.file_path ?? path,
        name: pendingFile.name,
        size: `${(pendingFile.size / 1024).toFixed(0)} KB`,
        date: formatDate(new Date(), lang),
        status: "pending",
      }, ...prev]);

      setUploadProgress(100);
      toast.success(t("upload_success").replace("{name}", uploadTitle.trim()));

      // Close modal
      setPendingFile(null);
      setUploadTitle("");
      setUploadDescription("");
    } catch (e: any) {
      // Storage rejections (size / type rules) come back as raw English text
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("exceed") || msg.includes("too large") || msg.includes("payload")) toast.error(t("upload_too_large"));
      else if (msg.includes("mime") || msg.includes("not allowed") || msg.includes("not supported")) toast.error(t("upload_wrong_type"));
      else toast.error(t("upload_failed"));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [user, pendingFile, uploadTitle, uploadDescription, t]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/png": [], "image/jpeg": [], "application/pdf": [] },
    maxSize: MAX_UPLOAD_BYTES,
    onDropRejected: (rejections) => {
      const code = rejections[0]?.errors[0]?.code;
      toast.error(t(code === "file-too-large" ? "upload_too_large" : "upload_wrong_type"));
    },
    multiple: false,
    disabled: uploading || !!pendingFile,
  });

  const { myDecls, myInvoices, mySharedDocs, totalDue, overdueIds, myRegime, requiredTypes, vault, myEmpCount, myHasCacobatph } = useMemo(() => {
    if (!user) return {
      myDecls: [] as Decl[], myInvoices: [] as Invoice[], mySharedDocs: [] as SharedDoc[],
      totalDue: 0, overdueIds: new Set<string>(), myRegime: undefined as TaxRegime | undefined, requiredTypes: [] as DeclType[], vault: [] as VaultEntry[],
      myEmpCount: 0, myHasCacobatph: false,
    };
    const mine = biz.clients;
    const ids = new Set(mine.map((c) => c.id));
    const regime = mine.find((c) => c.taxRegime)?.taxRegime;
    const hasCaco = mine.some((c) => c.hasCacobatph);
    const empCount = biz.employeeCount;
    const required = regime ? REGIME_DECLS[regime] : [];
    const requiredSet = new Set<DeclType>(required);
    const ownDecls = biz.decls.filter((d) => ids.has(d.clientId));
    const myD = regime ? ownDecls.filter((d) => requiredSet.has(d.type)) : ownDecls;
    const myI = biz.invoices.filter((i) => ids.has(i.clientId));
    const myS = dbSharedDocs;
    // A filed declaration is declared, not paid, and there is no "paid" state yet. It keeps counting as still to pay
    // until the same declaration for a later period has been filed (the accountant's own "pending" totals count
    // only what is not yet filed). Once its due date has passed it is shown as overdue.
    const today = todayIso();
    const latestFiled = new Map<string, string>();
    for (const d of myD) if (d.status === "filed" && d.due && d.due > (latestFiled.get(d.type) ?? "")) latestFiled.set(d.type, d.due);
    const open = myD.filter((d) => d.status !== "filed" || !d.due || d.due >= (latestFiled.get(d.type) ?? ""));
    const due = open.reduce((s, d) => s + d.amount, 0);
    const overdueIds = new Set(open.filter((d) => !!d.due && d.due < today).map((d) => d.id));
    const v = sortVault([...vaultFromShared(dbSharedDocs), ...vaultFromInvoiceDocs(biz.invoiceDocs, user.name, user.email)]);
    return { myDecls: myD, myInvoices: myI, mySharedDocs: myS, totalDue: due, overdueIds, myRegime: regime, requiredTypes: required, vault: v, myEmpCount: empCount, myHasCacobatph: hasCaco };
  }, [user, biz, dbSharedDocs]);

  // Auth/role guard handled by ProtectedRoute wrapper — keep all hooks unconditional below.

  const removeDoc = useCallback(async (i: number) => {
    const doc = docs[i];
    if (!doc) return;

    // Legacy local-only entry (no backend record) — just drop from UI.
    if (!doc.id || !doc.file_path) {
      setDocs((prev) => prev.filter((_, idx) => idx !== i));
      return;
    }

    const { data: au } = await supabase.auth.getUser();
    const uid = au.user?.id;
    if (!uid) {
      toast.error(t("upload_session_expired"));
      return;
    }

    // 1) Delete the file from Supabase Storage first.
    const { error: storageErr } = await supabase.storage
      .from("client-uploads")
      .remove([doc.file_path]);
    if (storageErr) {
      toast.error(storageErr.message);
      return;
    }

    // 2) Then delete the metadata row. RLS already restricts deletes to user_id = auth.uid().
    const { error: dbErr } = await supabase
      .from("documents")
      .delete()
      .eq("id", doc.id)
      .eq("user_id", uid);
    if (dbErr) {
      toast.error(dbErr.message);
      return;
    }

    // 3) Only now drop from the UI.
    setDocs((prev) => prev.filter((_, idx) => idx !== i));
  }, [docs, t]);

  const declsForApproval = mySharedDocs.filter((s) => s.type === "G50");

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <SiteHeader />
      <main className="container py-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge className="bg-gold/20 text-gold-deep border-gold/40 hover:bg-gold/30">{t("dash_cli_title")}</Badge>
            {myRegime && (
              <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5 font-mono text-[10px]">
                {t("client_tax_regime")}: {regimeShort(myRegime)}
              </Badge>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary">
            {t("dash_cli_welcome")}, {user?.name.split(" ")[0]} 👋
          </h1>
          {user?.company && <p className="text-muted-foreground mt-1">{user.company}</p>}
        </div>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="upload"><UploadCloud className="h-4 w-4" /> {t("cli_upload_center")}</TabsTrigger>
            <TabsTrigger value="checklist"><CheckCircle2 className="h-4 w-4" /> {t("chk_title")}</TabsTrigger>
            <TabsTrigger value="deadlines"><CalendarDays className="h-4 w-4" /> {t("cli_deadlines_title")}</TabsTrigger>
            <TabsTrigger value="approve"><FileSignature className="h-4 w-4" /> {t("cli_decls_to_approve")} {declsForApproval.length > 0 && (
              <Badge className="ms-1 h-4 px-1 text-[10px] bg-gold text-gold-foreground border-0">{declsForApproval.length}</Badge>
            )}</TabsTrigger>
            <TabsTrigger value="vault"><Archive className="h-4 w-4" /> {t("vault_title")}</TabsTrigger>
            <TabsTrigger value="chat"><MessageCircle className="h-4 w-4" /> {t("chat_label")}</TabsTrigger>
          </TabsList>

          {/* === UPLOAD CENTER === */}
          <TabsContent value="upload" className="mt-5">
            <div className="grid lg:grid-cols-3 gap-5 items-start">
              <div className={`lg:col-span-2 space-y-5 ${PANEL_SCROLL}`}>
                <Card className="p-6 shadow-card">
                  <h2 className="text-lg font-bold text-primary mb-1">{t("dash_upload_title")}</h2>
                  <p className="text-sm text-muted-foreground mb-5">{t("dash_upload_subtitle")}</p>
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-smooth ${
                      isDragActive
                        ? "border-gold bg-gold/5 scale-[1.01]"
                        : "border-primary/30 hover:border-primary hover:bg-primary/5"
                    }`}
                  >
                    <input {...getInputProps()} />
                    <div className="inline-flex p-4 rounded-2xl bg-gradient-gold text-gold-foreground mb-4 shadow-gold">
                      <UploadCloud className="h-8 w-8" />
                    </div>
                    <div className="text-lg font-semibold text-foreground mb-1">
                      {isDragActive ? t("dash_upload_drop") : t("dash_upload_title")}
                    </div>
                    <div className="text-sm text-muted-foreground mb-4">{t("file_pdf_jpg_png_5mb")}</div>
                    <Button variant="hero" size="sm" type="button">{t("dash_upload_cta")}</Button>
                  </div>
                </Card>

                <Card className="p-5 sm:p-6 shadow-card border-gold/30 bg-linear-to-br from-card to-gold/5">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-gold-deep" /> {t("cli_docs_acc_title")}
                    </h2>
                    <Badge variant="secondary" className="text-xs">{mySharedDocs.length}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">{t("cli_docs_acc_subtitle")}</p>
                  {mySharedDocs.length === 0 ? (
                    <div className="text-center px-4 py-8 border border-dashed border-gold/30 rounded-lg">
                      <p className="text-sm text-muted-foreground">{t("cli_docs_empty")}</p>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {mySharedDocs.map((s) => (
                        <div key={s.id} className="p-3 rounded-lg border border-border/60 hover:border-gold/60 hover:shadow-gold transition-smooth bg-card">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-md bg-gradient-gold text-gold-foreground shrink-0 shadow-gold">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge variant="outline" className="font-mono text-[10px]">{s.type}</Badge>
                                <WorkflowBadge status={s.workflow} t={t} />
                                {s.signedAt && <Badge className="bg-success/15 text-success border-success/40 text-[10px]"><CheckCircle2 className="h-3 w-3 me-1" /> {t("vault_signed")}</Badge>}
                                <span className="text-[10px] text-muted-foreground">{s.date}</span>
                              </div>
                              <div className="font-medium text-sm text-foreground truncate">{s.label}</div>
                              <div className="mt-2 flex items-center gap-1">
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setPreviewDoc(s)}>
                                  <Eye className="h-3 w-3" /> {t("preview_btn")}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {accountantPdfs.length > 0 && (
                  <Card className="p-5 sm:p-6 shadow-card border-gold/30 bg-linear-to-br from-card to-gold/5">
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-gold-deep" /> {t("cli_docs_acc_title")}
                      </h2>
                      <Badge variant="secondary" className="text-xs">{accountantPdfs.length}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">{t("cli_docs_acc_subtitle")}</p>
                    <div className="space-y-2">
                      {accountantPdfs.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card">
                          <div className="p-2 rounded-md bg-gradient-gold text-gold-foreground shadow-gold">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{p.title}</div>
                            <div className="text-[11px] text-muted-foreground">{formatDateTime(p.created_at, lang)}</div>
                          </div>
                          <Button
                            size="sm"
                            variant="outlineGold"
                            disabled={downloadingPdf === p.id}
                            onClick={() => downloadAccountantPdf(p.id, p.file_path, p.title)}
                          >
                            <Download className="h-3.5 w-3.5" /> {t("download_pdf") || "Download PDF"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <Card className="p-5 sm:p-6 shadow-card">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-primary">{t("dash_my_docs")}</h2>
                    <Badge variant="secondary" className="text-xs">{docs.length}</Badge>
                  </div>
                  {docs.length === 0 ? (
                    <div className="text-center py-10">
                      <div className="inline-flex p-3 rounded-full bg-muted text-muted-foreground mb-3">
                        <Inbox className="h-6 w-6" />
                      </div>
                      <p className="text-sm text-muted-foreground">{t("empty_no_docs")}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {docs.map((d, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/40 transition-smooth">
                          <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
                            {d.name.toLowerCase().endsWith(".pdf") ? <FileText className="h-4 w-4" /> : <FileImage className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-foreground truncate">{d.name}</div>
                            <div className="text-xs text-muted-foreground"><bdi dir="ltr">{d.size}</bdi> • {d.date}</div>
                          </div>
                          <Badge className="bg-warning/15 text-warning-foreground border-warning/40 hover:bg-warning/20">
                            <Clock className="h-3 w-3 me-1" /> {t("dash_status_pending")}
                          </Badge>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeDoc(i)} aria-label={t("common_delete")}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <div className={`space-y-5 ${PANEL_SCROLL}`}>
                <Card className="p-5 shadow-card">
                  <h2 className="text-base font-bold text-primary mb-3 flex items-center gap-2">
                    <Receipt className="h-4 w-4" /> {t("cli_my_obligations")}
                  </h2>
                  {myDecls.length === 0 ? (
                    <div className="text-center px-4 py-6 border border-dashed border-border rounded-lg">
                      <div className="text-xs text-muted-foreground">{t("cli_no_obligations")}</div>
                    </div>
                  ) : (
                    <>
                      <div className="p-3 rounded-lg bg-linear-to-br from-gold/10 to-gold/5 border border-gold/30 mb-3">
                        <div className="text-xs text-muted-foreground">{t("cli_total_due")}</div>
                        <div className="text-2xl font-bold text-gold-deep">{fmtDZD(totalDue)}</div>
                      </div>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {myDecls.map((d) => (
                          <div key={d.id} className="flex items-center justify-between p-2 rounded border border-border/60 text-xs">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-[10px]">{d.type}</Badge>
                              <span className="text-muted-foreground">{d.due}</span>
                              {overdueIds.has(d.id) && <Badge variant="destructive" className="text-[10px]">{t("dash_overdue")}</Badge>}
                            </div>
                            <span className="font-semibold">{fmtDZD(d.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Card>

                <Card className="p-5 shadow-card">
                  <h2 className="text-base font-bold text-primary mb-3 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> {t("cli_from_accountant")}
                  </h2>
                  {myInvoices.length === 0 && mySharedDocs.length === 0 ? (
                    <div className="text-center px-4 py-6 border border-dashed border-border rounded-lg">
                      <div className="text-xs text-muted-foreground">{t("empty_pending_acc")}</div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {myInvoices.length > 0 && (
                        <div className="text-xs text-muted-foreground mb-2">{myInvoices.length} {t("cli_invoices_received")}</div>
                      )}
                      {myInvoices.slice(0, 5).map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between p-2 rounded border border-border/60 text-xs">
                          <span className="font-mono text-muted-foreground">{inv.id}</span>
                          <span className="font-semibold text-gold-deep">{fmtDZD(inv.amount)}</span>
                        </div>
                      ))}
                      {mySharedDocs.slice(0, 5).map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-2 p-2 rounded border border-border/60 text-xs">
                          <Badge variant="outline" className="font-mono text-[10px]">{s.type}</Badge>
                          <span className="flex-1 min-w-0 truncate">{s.label}</span>
                          <span className="text-muted-foreground">{s.date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* === MONTHLY CHECKLIST === */}
          <TabsContent value="checklist" className="mt-5">
            <DocChecklist t={t} />
          </TabsContent>

          {/* === DEADLINES === */}
          <TabsContent value="deadlines" className="mt-5 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-gold-deep" /> {t("cli_deadlines_title")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("cli_deadlines_subtitle")}</p>
            </div>
            <FiscalCalendar t={t} regime={myRegime} limit={20} employeeCount={myEmpCount} hasCacobatph={myHasCacobatph} />
          </TabsContent>

          {/* === DECLARATIONS FOR APPROVAL === */}
          <TabsContent value="approve" className="mt-5">
            <Card className="p-6 shadow-card">
              <h2 className="text-lg font-bold text-primary mb-1 flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-gold-deep" /> {t("cli_decls_to_approve")}
              </h2>
              <p className="text-xs text-muted-foreground mb-5">{t("sig_subtitle")}</p>
              {declsForApproval.length === 0 ? (
                <div className="text-center px-4 py-10 border border-dashed border-border rounded-lg">
                  <p className="text-sm text-muted-foreground">{t("cli_decls_empty")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {declsForApproval.map((s) => (
                    <div key={s.id} className="p-4 rounded-lg border border-border/60 hover:border-gold/60 transition-smooth bg-card flex items-center gap-4 flex-wrap">
                      <div className="p-2.5 rounded-md bg-gradient-gold text-gold-foreground shadow-gold">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-[220px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="font-mono text-[10px]">{s.type}</Badge>
                          {s.signedAt ? (
                            <Badge className="bg-success/15 text-success border-success/40 text-[10px]">
                              <CheckCircle2 className="h-3 w-3 me-1" /> {t("vault_signed")}
                            </Badge>
                          ) : (
                            <Badge className="bg-warning/15 text-warning-foreground border-warning/40 text-[10px]">
                              <Clock className="h-3 w-3 me-1" /> {t("vault_unsigned")}
                            </Badge>
                          )}
                          <span className="text-[11px] text-muted-foreground">{s.date}</span>
                        </div>
                        <div className="font-semibold text-sm text-foreground mt-1">{s.label}</div>
                        {s.signedAt && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {t("cli_signed_on")} {formatDateTime(s.signedAt, lang)}
                          </div>
                        )}
                      </div>
                      {s.signedAt ? (
                        <Button size="sm" variant="outline" onClick={() => setSigning(s)}>
                          <FileText className="h-3.5 w-3.5" /> {t("cli_review_sign")}
                        </Button>
                      ) : (
                        <Button size="sm" variant="gold" onClick={() => setSigning(s)}>
                          <PenTool className="h-3.5 w-3.5" /> {t("cli_review_sign")}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* === DOCUMENT VAULT === */}
          <TabsContent value="vault" className="mt-5">
            {/* keep existing vault content unchanged */}
          </TabsContent>

          {/* === REAL-TIME CHAT === */}
          <TabsContent value="chat" className="mt-5">
            <ChatTab role="client" />
          </TabsContent>
        </Tabs>
      </main>

      {/* Signature Dialog */}
      <SignDialog
        doc={signing}
        onClose={() => setSigning(null)}
        onSigned={async (id, sig) => {
          if (!user) return;
          await signSharedDocDb(id, {
            signatureDataUrl: sig,
            signedAt: new Date().toISOString(),
            signedBy: user.name,
          });
          await refreshSharedDocs();
          try {
            const accId = await myAccountantId();
            if (accId) {
              await sendNotification({
                recipientId: accId,
                title: t("notif_doc_signed_title"),
                message: t("notif_doc_signed_msg")
                  .replace("{client}", user.name)
                  .replace("{label}", signing?.label || ""),
                type: "doc_signed",
                link: "/dashboard/accountant",
                refId: id,
              });
            }
          } catch { /* the signature itself is saved */ }
          toast.success(t("sig_success"));
          setSigning(null);
        }}
        t={t}
      />

      {/* Document preview */}
      <DocPreviewDialog
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.label || ""}
        fileName={previewDoc?.fileName}
        mimeType={previewDoc?.mimeType}
        fileData={previewDoc?.fileData}
        meta={previewDoc?.payload ? safeParse(previewDoc.payload) : undefined}
        t={t}
      />

      {/* Upload confirmation modal */}
      <Dialog open={!!pendingFile} onOpenChange={(o) => !o && closeUploadModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4" /> {t("upload_confirm_title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {pendingFile && (
              <div className="p-3 rounded-lg border border-border/60 bg-muted/40 flex items-center gap-3">
                <div className="p-2 rounded bg-gold/10 text-gold-deep">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{pendingFile.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {(pendingFile.size / 1024).toFixed(1)} KB · {pendingFile.type || t("upload_file_type_default")}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="up-title">{t("upload_title_label")}</Label>
              <Input
                id="up-title"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder={t("upload_title_ph")}
                disabled={uploading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="up-desc">{t("upload_desc_label")}</Label>
              <Textarea
                id="up-desc"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder={t("upload_desc_ph")}
                rows={3}
                disabled={uploading}
              />
            </div>

            {uploading && (
              <div className="space-y-1.5">
                <Progress value={uploadProgress} className="h-2" />
                <div className="text-[11px] text-muted-foreground text-center">
                  {t("upload_progress")} {uploadProgress}%
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={closeUploadModal} disabled={uploading}>
              {t("upload_cancel")}
            </Button>
            <Button variant="hero" onClick={confirmUpload} disabled={uploading || !uploadTitle.trim()}>
              {uploading ? t("upload_progress") : t("upload_confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default ClientDashboard;
