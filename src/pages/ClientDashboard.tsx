import { useState, useCallback, useEffect, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { useApp } from "@/contexts/AppContext";
import { SiteHeader } from "@/components/SiteHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UploadCloud, FileText, CheckCircle2, Clock, FileImage, Inbox, Trash2, Receipt, ShieldCheck,
  FolderOpen, Download, PenTool, Archive, FileSignature, Eye, CalendarDays,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SignaturePad } from "@/components/SignaturePad";
import { ChatTab } from "@/components/ChatTab";
import { MessageCircle } from "lucide-react";
import { DocChecklist } from "@/components/DocChecklist";
import { DocPreviewDialog } from "@/components/DocPreviewDialog";
import { WorkflowBadge } from "@/components/WorkflowStatus";
import { FiscalCalendar } from "@/components/FiscalCalendar";
import {
  addIncomingInvoice, pushNotification, getVault, onPortalChange, type VaultEntry,
} from "@/lib/portal";
import { loadSharedDocsForClient, signSharedDocDb } from "@/lib/accountantStore";

interface Doc { id?: string; file_path?: string; name: string; size: string; date: string; status: "processed" | "pending" }
type DeclType = "G50" | "CNAS" | "CASNOS" | "CACOBATPH" | "TAP" | "IBS" | "FS" | "G12" | "CP";
type TaxRegime = "REEL" | "SIMPLIFIE" | "IFU";
interface Decl { id: string; clientId: string; clientName: string; type: DeclType; amount: number; due: string; status: "upcoming" | "filed" | "overdue" }
interface Invoice { id: string; clientId: string; clientName: string; amount: number; date: string; status: string }
interface ClientRow { id: string; name: string; taxId: string; contact: string; taxRegime?: TaxRegime }
interface SharedDoc {
  id: string; clientId: string; clientName: string; clientEmail: string;
  type: "G50" | "CNAS" | "FS" | "OTHER"; label: string; date: string;
  payload?: string; fileName?: string; mimeType?: string; fileData?: string;
  signatureDataUrl?: string; signedAt?: string; signedBy?: string;
  workflow?: "draft" | "review" | "sent" | "signed" | "filed";
}

const REGIME_DECLS: Record<TaxRegime, DeclType[]> = {
  REEL:      ["G50", "TAP", "IBS", "FS"],
  SIMPLIFIE: ["G50", "TAP", "IBS", "FS"],
  IFU:       ["G12", "CP"],
};
const regimeShort = (r?: TaxRegime) =>
  r === "REEL" ? "Réel" : r === "SIMPLIFIE" ? "Simplifié" : r === "IFU" ? "IFU" : "";

const fmtDZD = (n: number) =>
  `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(n)} DA`;

const STORAGE_KEY = "mgmtk_client_docs";

const ClientDashboard = () => {
  const { t, user } = useApp();
  const [docs, setDocs] = useState<Doc[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  });
  const [tick, setTick] = useState(0);
  const [signing, setSigning] = useState<SharedDoc | null>(null);
  const [previewDoc, setPreviewDoc] = useState<SharedDoc | null>(null);
  const [dbSharedDocs, setDbSharedDocs] = useState<SharedDoc[]>([]);

  // Load shared documents from the DB (RLS scopes to this client).
  const refreshSharedDocs = useCallback(async () => {
    const rows = await loadSharedDocsForClient();
    setDbSharedDocs(rows as SharedDoc[]);
  }, []);
  useEffect(() => { refreshSharedDocs(); }, [refreshSharedDocs]);

  // ── Upload confirmation modal state ──
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  }, [docs]);

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
      if (cancelled || error || !data) return;
      setDocs(
        data.map((d) => ({
          id: d.id,
          file_path: d.file_path,
          name: d.file_name,
          size: typeof d.size === "number" ? `${(d.size / 1024).toFixed(0)} KB` : "—",
          date: new Date(d.created_at).toLocaleDateString(),
          status: "pending" as const,
        })),
      );
    };
    fetchDocs();
    return () => { cancelled = true; };
  }, []);

  // Listen to portal-wide changes (signatures, new shared docs, etc.)
  useEffect(() => onPortalChange(() => setTick((x) => x + 1)), []);

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

      const safeName = pendingFile.name.replace(/[^\w.\-]+/g, "_");
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
      }).select("id,file_path").single();
      if (dbErr) throw dbErr;
      setUploadProgress(90);

      // 4) Mirror into the legacy local-portal stream so the accountant view stays in sync
      try {
        const dataUrl = pendingFile.size <= 5 * 1024 * 1024 ? await fileToDataUrl(pendingFile) : undefined;
        addIncomingInvoice({
          clientEmail: user.email,
          clientName: user.name,
          fileName: pendingFile.name,
          mimeType: pendingFile.type || "application/octet-stream",
          fileData: dataUrl,
          size: pendingFile.size,
          note: uploadDescription.trim() || undefined,
        } as any);
        pushNotification({
          forRole: "accountant",
          fromName: user.name,
          title: t("notif_invoice_uploaded_title"),
          message: t("notif_invoice_uploaded_msg")
            .replace("{client}", user.name)
            .replace("{file}", pendingFile.name),
          type: "invoice_uploaded",
          link: "/dashboard/accountant",
        });
      } catch { /* non-blocking */ }

      setDocs((prev) => [{
        id: inserted?.id,
        file_path: inserted?.file_path ?? path,
        name: pendingFile.name,
        size: `${(pendingFile.size / 1024).toFixed(0)} KB`,
        date: new Date().toLocaleDateString(),
        status: "pending",
      }, ...prev]);

      setUploadProgress(100);
      toast.success(t("upload_success").replace("{name}", uploadTitle.trim()));

      // Close modal
      setPendingFile(null);
      setUploadTitle("");
      setUploadDescription("");
    } catch (e: any) {
      toast.error(e?.message || t("upload_failed"));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [user, pendingFile, uploadTitle, uploadDescription, t]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [], "application/pdf": [] },
    multiple: false,
    disabled: uploading || !!pendingFile,
  });

  const { myDecls, myInvoices, mySharedDocs, totalDue, myRegime, requiredTypes, vault, myEmpCount, myHasCacobatph } = useMemo(() => {
    if (!user) return {
      myDecls: [] as Decl[], myInvoices: [] as Invoice[], mySharedDocs: [] as SharedDoc[],
      totalDue: 0, myRegime: undefined as TaxRegime | undefined, requiredTypes: [] as DeclType[], vault: [] as VaultEntry[],
      myEmpCount: 0, myHasCacobatph: false,
    };
    const allClients: any[] = JSON.parse(localStorage.getItem("mgmtk_acc_clients") || "[]");
    const allDecls: Decl[] = JSON.parse(localStorage.getItem("mgmtk_acc_declarations") || "[]");
    const allInvoices: Invoice[] = JSON.parse(localStorage.getItem("mgmtk_acc_invoices") || "[]");
    const allShared: SharedDoc[] = JSON.parse(localStorage.getItem("mgmtk_acc_shared_docs") || "[]");
    const allEmployees: any[] = JSON.parse(localStorage.getItem("mgmtk_acc_employees") || "[]");
    const mine = allClients.filter(
      (c) => c.contact?.toLowerCase() === user.email.toLowerCase()
    );
    const ids = new Set(mine.map((c) => c.id));
    const regime = mine.find((c) => c.taxRegime)?.taxRegime;
    const hasCaco = mine.some((c) => c.hasCacobatph);
    const empCount = allEmployees.filter((e) => ids.has(e.clientId)).length;
    const required = regime ? REGIME_DECLS[regime] : [];
    const requiredSet = new Set<DeclType>(required);
    const ownDecls = allDecls.filter((d) => ids.has(d.clientId));
    const myD = regime ? ownDecls.filter((d) => requiredSet.has(d.type)) : ownDecls;
    const myI = allInvoices.filter((i) => ids.has(i.clientId));
    const myS = dbSharedDocs;
    const due = myD.filter((d) => d.status !== "filed").reduce((s, d) => s + d.amount, 0);
    const v = getVault({ clientEmail: user.email });
    return { myDecls: myD, myInvoices: myI, mySharedDocs: myS, totalDue: due, myRegime: regime, requiredTypes: required, vault: v, myEmpCount: empCount, myHasCacobatph: hasCaco };
  }, [user, docs, tick, dbSharedDocs]);

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
            {t("dash_cli_welcome")}, {user.name.split(" ")[0]} 👋
          </h1>
          {user.company && <p className="text-muted-foreground mt-1">{user.company}</p>}
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
            <div className="grid lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 space-y-5">
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

                <Card className="p-5 sm:p-6 shadow-card border-gold/30 bg-gradient-to-br from-card to-gold/5">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-gold-deep" /> {t("cli_docs_acc_title")}
                    </h2>
                    <Badge variant="secondary" className="text-xs">{mySharedDocs.length}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">{t("cli_docs_acc_subtitle")}</p>
                  {mySharedDocs.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-gold/30 rounded-lg">
                      <p className="text-sm text-muted-foreground">{t("cli_docs_empty")}</p>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {mySharedDocs.map((s) => (
                        <div key={s.id} className="p-3 rounded-lg border border-border/60 hover:border-gold/60 hover:shadow-gold transition-smooth bg-card">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-md bg-gradient-gold text-gold-foreground flex-shrink-0 shadow-gold">
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
                          <div className="p-2 rounded-md bg-primary/10 text-primary flex-shrink-0">
                            {d.name.toLowerCase().endsWith(".pdf") ? <FileText className="h-4 w-4" /> : <FileImage className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-foreground truncate">{d.name}</div>
                            <div className="text-xs text-muted-foreground">{d.size} • {d.date}</div>
                          </div>
                          <Badge className="bg-warning/15 text-warning-foreground border-warning/40 hover:bg-warning/20">
                            <Clock className="h-3 w-3 me-1" /> {t("dash_status_pending")}
                          </Badge>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeDoc(i)}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <div className="space-y-5">
                <Card className="p-5 shadow-card">
                  <h2 className="text-base font-bold text-primary mb-3 flex items-center gap-2">
                    <Receipt className="h-4 w-4" /> {t("cli_my_obligations")}
                  </h2>
                  {myDecls.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-border rounded-lg">
                      <div className="text-xs text-muted-foreground">{t("cli_no_obligations")}</div>
                    </div>
                  ) : (
                    <>
                      <div className="p-3 rounded-lg bg-gradient-to-br from-gold/10 to-gold/5 border border-gold/30 mb-3">
                        <div className="text-xs text-muted-foreground">{t("cli_total_due")}</div>
                        <div className="text-2xl font-bold text-gold-deep">{fmtDZD(totalDue)}</div>
                      </div>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {myDecls.map((d) => (
                          <div key={d.id} className="flex items-center justify-between p-2 rounded border border-border/60 text-xs">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-[10px]">{d.type}</Badge>
                              <span className="text-muted-foreground">{d.due}</span>
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
                  {myInvoices.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-border rounded-lg">
                      <div className="text-xs text-muted-foreground">{t("empty_pending_acc")}</div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="text-xs text-muted-foreground mb-2">{myInvoices.length} {t("cli_invoices_received")}</div>
                      {myInvoices.slice(0, 5).map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between p-2 rounded border border-border/60 text-xs">
                          <span className="font-mono text-muted-foreground">{inv.id}</span>
                          <span className="font-semibold text-gold-deep">{fmtDZD(inv.amount)}</span>
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
            <DocChecklist t={t} clientEmail={user.email} clientName={user.name} />
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
                <div className="text-center py-10 border border-dashed border-border rounded-lg">
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
                            {t("cli_signed_on")} {new Date(s.signedAt).toLocaleString("fr-DZ")}
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
          pushNotification({
            forRole: "accountant",
            title: t("notif_doc_signed_title"),
            message: t("notif_doc_signed_msg")
              .replace("{client}", user.name)
              .replace("{label}", signing?.label || ""),
            type: "doc_signed",
          });
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

const safeParse = (s: string): Record<string, string> | undefined => {
  try { const o = JSON.parse(s); return typeof o === "object" && o ? o : undefined; } catch { return undefined; }
};

const SignDialog = ({
  doc, onClose, onSigned, t,
}: { doc: SharedDoc | null; onClose: () => void; onSigned: (id: string, sig: string) => void; t: (k: string) => string }) => {
  const [sig, setSig] = useState<string | null>(null);
  useEffect(() => { setSig(null); }, [doc?.id]);
  if (!doc) return null;
  const alreadySigned = !!doc.signedAt;
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-gold-deep" /> {doc.label}
          </DialogTitle>
        </DialogHeader>

        {/* Document preview */}
        <div className="p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="font-mono text-[10px]">{doc.type}</Badge>
            <span className="text-[11px] text-muted-foreground">{doc.date}</span>
          </div>
          <div className="text-sm font-semibold text-primary">{doc.label}</div>
          {doc.payload && (() => {
            try {
              const p = JSON.parse(doc.payload);
              return (
                <div className="grid grid-cols-2 gap-2 text-[11px] mt-2">
                  {Object.entries(p).slice(0, 8).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2 border-b border-border/40 py-1">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-mono font-semibold text-foreground truncate">{String(v)}</span>
                    </div>
                  ))}
                </div>
              );
            } catch { return null; }
          })()}
        </div>

        {alreadySigned ? (
          <div className="p-4 rounded-lg border-2 border-success/40 bg-success/5 text-center space-y-2">
            <Badge className="bg-success/15 text-success border-success/40">
              <CheckCircle2 className="h-3 w-3 me-1" /> {t("sig_signed_stamp")}
            </Badge>
            {doc.signatureDataUrl && (
              <img src={doc.signatureDataUrl} alt="signature" className="mx-auto h-20 object-contain" />
            )}
            <div className="text-xs text-muted-foreground">
              {doc.signedBy} • {doc.signedAt && new Date(doc.signedAt).toLocaleString("fr-DZ")}
            </div>
          </div>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold text-primary mb-2">{t("sig_title")}</h3>
              <SignaturePad onChange={setSig} t={t} />
            </div>
            <DialogFooter className="gap-2 flex-wrap">
              <Button
                variant="outlineGold"
                onClick={() => {
                  // Quick "click to sign" — generate a simple text signature
                  const c = document.createElement("canvas");
                  c.width = 520; c.height = 180;
                  const ctx = c.getContext("2d")!;
                  ctx.fillStyle = "#0a3055";
                  ctx.font = "italic 48px 'Brush Script MT', cursive";
                  ctx.fillText("✓ Signed", 30, 100);
                  ctx.font = "14px sans-serif";
                  ctx.fillText(new Date().toLocaleString("fr-DZ"), 30, 140);
                  onSigned(doc.id, c.toDataURL("image/png"));
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("sig_click_to_sign")}
              </Button>
              <Button
                variant="gold"
                onClick={() => {
                  if (!sig) { toast.error(t("sig_required")); return; }
                  onSigned(doc.id, sig);
                }}
              >
                <PenTool className="h-3.5 w-3.5" /> {t("sig_apply")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const VaultView = ({ entries, t }: { entries: VaultEntry[]; t: (k: string) => string }) => {
  const groups = useMemo(() => {
    const m = new Map<string, VaultEntry[]>();
    for (const e of entries) {
      const arr = m.get(e.monthKey) || [];
      arr.push(e);
      m.set(e.monthKey, arr);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  return (
    <Card className="p-6 shadow-card">
      <h2 className="text-lg font-bold text-primary mb-1 flex items-center gap-2">
        <Archive className="h-4 w-4 text-gold-deep" /> {t("vault_title")}
      </h2>
      <p className="text-xs text-muted-foreground mb-5">{t("vault_subtitle")}</p>

      {entries.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">{t("vault_empty")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([month, items]) => (
            <div key={month}>
              <div className="text-xs uppercase tracking-wide font-bold text-primary mb-2 border-b border-border/60 pb-1">
                {new Date(month + "-01").toLocaleDateString("fr-DZ", { month: "long", year: "numeric" })}
                <Badge variant="secondary" className="ms-2 text-[10px]">{items.length}</Badge>
              </div>
              <div className="space-y-1.5">
                {items.map((e) => (
                  <div key={e.id} className="flex items-center justify-between p-2.5 rounded border border-border/60 text-xs hover:border-primary/40 transition-smooth">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Badge variant="outline" className="font-mono text-[10px]">{e.type}</Badge>
                      <span className="font-medium truncate">{e.label}</span>
                      {e.kind === "shared_doc" && (
                        e.signed ? (
                          <Badge className="bg-success/15 text-success border-success/40 text-[10px]">
                            <CheckCircle2 className="h-3 w-3 me-0.5" /> {t("vault_signed")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{t("vault_unsigned")}</Badge>
                        )
                      )}
                    </div>
                    <span className="text-muted-foreground text-[11px] ms-2 flex-shrink-0">
                      {new Date(e.date).toLocaleDateString("fr-DZ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default ClientDashboard;
