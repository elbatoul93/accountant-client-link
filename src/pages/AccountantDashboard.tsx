import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { SiteHeader } from "@/components/SiteHeader";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, FileText, TrendingUp, AlertCircle, Bell, Receipt, ShieldCheck, Plus, Trash2, Inbox, FileDown,
  Wrench, BookOpen, Calculator, Send, Download, LayoutDashboard, FolderOpen, ChevronRight, ArrowLeft, Search,
  Building2, IdCard, Phone, Mail, MapPin, Upload, FileCheck2, Wallet, Pencil, Lock, Landmark, Clock,
  Eye, ListChecks, MessageCircle, Link2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { BillingView, JournalView, useSuiteData, aggregateForG50 } from "./accountant/SuiteModules";
import { PayrollAdvanced } from "./accountant/PayrollAdvanced";
import { ReportsView } from "./accountant/ReportsView";
import { TaxIntelView } from "./accountant/TaxIntelView";
import { LiasseFiscaleView } from "./accountant/LiasseFiscale";
import { AssetsView } from "./accountant/AssetsView";
import { FiscalCalendar } from "@/components/FiscalCalendar";
import { ChatTab } from "@/components/ChatTab";
import { DocChecklist } from "@/components/DocChecklist";
import { DocPreviewDialog } from "@/components/DocPreviewDialog";
import { WorkflowBadge, WorkflowStepper } from "@/components/WorkflowStatus";
import { lockPeriod, computeG50FromJournal, type JournalLine } from "@/lib/accounting/engine";
import { buildG50Preview, TAP_RATE } from "@/lib/accounting/algerianTax";
import {
  getIncomingInvoices, updateIncomingStatus, deleteIncomingInvoice,
  pushNotification, getVault, onPortalChange,
  setSharedDocWorkflow, updateSharedDocPayload, runUploadReminderSweep,
  unreadChatCount,
  type IncomingInvoice, type VaultEntry, type WorkflowStatus,
} from "@/lib/portal";
import { ClientStatusIcon } from "@/components/ClientStatusIcon";
import { ClientInviteManager } from "@/components/ClientInviteManager";
import { ClientFilesSection } from "@/components/ClientFilesSection";
import { Archive, Inbox as InboxIcon, FileSignature } from "lucide-react";

const fmtDZD = (n: number) =>
  `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(n)} DA`;

type TaxRegime = "REEL" | "SIMPLIFIE" | "IFU";

interface Client {
  id: string; name: string; company?: string;
  taxId: string; bp?: string; nis?: string; rc?: string;
  cnasNo?: string; casnosNo?: string; hasCacobatph?: boolean;
  email?: string; phone?: string; address?: string; legalForm?: string; activity?: string;
  taxRegime?: TaxRegime;
  contact: string; // legacy email used by client portal matching
  status: "active" | "review";
}
interface Invoice { id: string; clientId: string; clientName: string; amount: number; date: string; status: "pending" | "processed" | "review" }
type DeclType = "G50" | "CNAS" | "CASNOS" | "CACOBATPH" | "TAP" | "IBS" | "FS" | "G12" | "CP";
interface Decl { id: string; clientId: string; clientName: string; type: DeclType; amount: number; due: string; status: "upcoming" | "filed" | "overdue" }

// Declarations required per tax regime
const REGIME_DECLS: Record<TaxRegime, DeclType[]> = {
  REEL:      ["G50", "TAP", "IBS", "FS"],
  SIMPLIFIE: ["G50", "TAP", "IBS", "FS"],
  IFU:       ["G12", "CP"],
};

const regimeLabelKey = (r?: TaxRegime) =>
  r === "REEL" ? "client_tax_regime_reel"
  : r === "SIMPLIFIE" ? "client_tax_regime_simplifie"
  : r === "IFU" ? "client_tax_regime_ifu" : "";

const declLabelKey = (type: DeclType): string => {
  const map: Partial<Record<DeclType, string>> = {
    G50: "decl_type_g50", TAP: "decl_type_tap", IBS: "decl_type_ibs",
    FS: "decl_type_fs", G12: "decl_type_g12", CP: "decl_type_cp",
  };
  return map[type] || type;
};

interface FinStmt { id: string; clientId: string; clientName: string; year: string; assets: number; liabilities: number; equity: number; revenue: number; netResult: number; createdAt: string }
interface SharedDoc { id: string; clientId: string; clientName: string; clientEmail: string; type: "G50" | "CNAS" | "FS" | "OTHER"; label: string; date: string; payload?: string; fileName?: string; mimeType?: string; fileData?: string; signedAt?: string; signedBy?: string; signatureDataUrl?: string; workflow?: WorkflowStatus }
interface LegalDoc { id: string; clientId: string; label: string; kind: "RC" | "NIF" | "NIS" | "STATUTS" | "OTHER"; fileName?: string; mimeType?: string; fileData?: string; date: string }

const KEY_CLIENTS = "mgmtk_acc_clients";
const KEY_INVOICES = "mgmtk_acc_invoices";
const KEY_DECLS = "mgmtk_acc_declarations";
const KEY_FS = "mgmtk_acc_fs";
const KEY_SHARED = "mgmtk_acc_shared_docs";
const KEY_LEGAL = "mgmtk_acc_legal_docs";

const load = <T,>(k: string): T[] => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : [];
};

type View = "dashboard" | "clients" | "invoices" | "obligations" | "tools" | "profile" | "payroll" | "billing" | "journal" | "reports" | "taxintel" | "liasse" | "assets" | "calendar" | "incoming" | "vault" | "tracking" | "chat";

const AccountantDashboard = () => {
  const { t, user, loading } = useApp();
  const [clients, setClients] = useState<Client[]>(() => load<Client>(KEY_CLIENTS));
  const [invoices, setInvoices] = useState<Invoice[]>(() => load<Invoice>(KEY_INVOICES));
  const [decls, setDecls] = useState<Decl[]>(() => load<Decl>(KEY_DECLS));
  const [incoming, setIncoming] = useState<IncomingInvoice[]>(() => getIncomingInvoices());
  const [vault, setVault] = useState<VaultEntry[]>(() => getVault());
  useEffect(() => onPortalChange(() => {
    setIncoming(getIncomingInvoices());
    setVault(getVault());
  }), []);
  const [fsList, setFsList] = useState<FinStmt[]>(() => load<FinStmt>(KEY_FS));
  const [sharedDocs, setSharedDocs] = useState<SharedDoc[]>(() => load<SharedDoc>(KEY_SHARED));
  const [legalDocs, setLegalDocs] = useState<LegalDoc[]>(() => load<LegalDoc>(KEY_LEGAL));
  const { employees, setEmployees, bills, setBills, journal, setJournal, locks, setLocks, precompte, setPrecompte } = useSuiteData();
  const [obligationsClient, setObligationsClient] = useState<Client | null>(null);
  const [openTool, setOpenTool] = useState<null | "fs" | "g50" | "send">(null);
  const [view, setView] = useState<View>("dashboard");
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  // Secure edit flow: clicking Edit triggers a password lock; on success the form opens.
  const [pendingEditClient, setPendingEditClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [previewIncoming, setPreviewIncoming] = useState<IncomingInvoice | null>(null);
  const [editingShared, setEditingShared] = useState<SharedDoc | null>(null);
  const [trackingClientId, setTrackingClientId] = useState<string>("");
  const [viewG50Client, setViewG50Client] = useState<Client | null>(null);

  useEffect(() => { localStorage.setItem(KEY_CLIENTS, JSON.stringify(clients)); }, [clients]);
  useEffect(() => { localStorage.setItem(KEY_INVOICES, JSON.stringify(invoices)); }, [invoices]);
  useEffect(() => { localStorage.setItem(KEY_DECLS, JSON.stringify(decls)); }, [decls]);
  useEffect(() => { localStorage.setItem(KEY_FS, JSON.stringify(fsList)); }, [fsList]);
  useEffect(() => { localStorage.setItem(KEY_SHARED, JSON.stringify(sharedDocs)); }, [sharedDocs]);
  useEffect(() => { localStorage.setItem(KEY_LEGAL, JSON.stringify(legalDocs)); }, [legalDocs]);

  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "accountant") return <Navigate to="/dashboard/client" replace />;

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

  // Automated chat reminder for clients who have not uploaded by the 10th of the month.
  useEffect(() => {
    if (!clients.length) return;
    const sent = runUploadReminderSweep(
      clients.map((c) => ({ email: c.contact, name: c.name })),
      user?.name || "Cabinet Comptable",
    );
    if (sent > 0) toast.message(`${sent} rappel(s) envoyé(s) aux clients sans dépôt ce mois-ci.`);
    // run again every hour while the dashboard stays open
    const id = setInterval(() => {
      runUploadReminderSweep(
        clients.map((c) => ({ email: c.contact, name: c.name })),
        user?.name || "Cabinet Comptable",
      );
    }, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [clients, user?.name]);


  const activeClient = activeClientId ? clients.find((c) => c.id === activeClientId) || null : null;

  const openProfile = (c: Client) => {
    setActiveClientId(c.id);
    setView("profile");
  };

  // Recompute unread badge whenever portal data changes
  const [unreadMsgs, setUnreadMsgs] = useState<number>(() => unreadChatCount("accountant"));
  useEffect(() => onPortalChange(() => setUnreadMsgs(unreadChatCount("accountant"))), []);

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
        { key: "incoming", label: t("side_incoming"), icon: InboxIcon, count: incoming.filter((i) => i.status === "pending").length },
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
              <nav className="space-y-3">
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
                                ? "bg-primary text-primary-foreground shadow-sm"
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

            <Card className="p-4 mt-3 bg-gradient-to-br from-gold/10 to-card border-gold/30 shadow-card">
              <div className="text-xs text-muted-foreground mb-1">{user.name}</div>
              <div className="text-xs font-semibold text-gold-deep">{t("auth_role_accountant")}</div>
            </Card>
          </aside>

          {/* Main */}
          <main className="space-y-6 min-w-0">
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
              <IncomingDocsView t={t} items={incoming}
                onMarkProcessed={(id) => updateIncomingStatus(id, "processed")}
                onDelete={(id) => deleteIncomingInvoice(id)}
                onPreview={(it) => setPreviewIncoming(it)}
              />
            )}

            {view === "tracking" && (
              <TrackingView t={t} clients={clients} activeId={trackingClientId} setActiveId={setTrackingClientId} />
            )}

            {view === "chat" && (
              <ChatHubView t={t} />
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
                  onEdit={(c) => setPendingEditClient(c)}
                  onDelete={(id) => {
                    setClients((p) => p.filter((x) => x.id !== id));
                    setInvoices((p) => p.filter((x) => x.clientId !== id));
                    setDecls((p) => p.filter((x) => x.clientId !== id));
                    setLegalDocs((p) => p.filter((x) => x.clientId !== id));
                    toast.success("Supprimé");
                  }}
                  onExtract={setObligationsClient}
                  onViewG50={setViewG50Client}
                  onCopyInvite={async (c) => {
                    try {
                      const { data: { user: au } } = await supabase.auth.getUser();
                      if (!au) { toast.error("Non authentifié"); return; }
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
                          token: newToken, accountant_id: au.id, email: targetEmail,
                        });
                        if (error) { toast.error(error.message); return; }
                        token = newToken;
                      }
                      const url = `${window.location.origin}/invite/${token}`;
                      await navigator.clipboard.writeText(url).catch(() => {});
                      toast.success(`Lien d'invitation copié pour ${c.name}`);
                    } catch (e: any) {
                      toast.error(e?.message || "Erreur");
                    }
                  }}
                />
              </div>
            )}

            {view === "profile" && activeClient && (
              <ClientProfileView
                t={t} client={activeClient}
                decls={decls.filter((d) => d.clientId === activeClient.id)}
                invoices={invoices.filter((i) => i.clientId === activeClient.id)}
                legalDocs={legalDocs.filter((d) => d.clientId === activeClient.id)}
                onBack={() => { setActiveClientId(null); setView("clients"); }}
                onAddLegal={(doc) => setLegalDocs((p) => [doc, ...p])}
                onDeleteLegal={(id) => setLegalDocs((p) => p.filter((x) => x.id !== id))}
                onAddDecl={(d) => setDecls((p) => [d, ...p])}
                onExtract={() => setObligationsClient(activeClient)}
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
                  <InvoiceTable invoices={invoices} t={t} onDelete={(id) => setInvoices((p) => p.filter((x) => x.id !== id))} />
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
                    onDelete={(id) => setDecls((p) => p.filter((x) => x.id !== id))}
                    onSend={(d) => {
                      const c = clients.find((x) => x.id === d.clientId);
                      if (!c) return;
                      const shared: SharedDoc = {
                        id: crypto.randomUUID(), clientId: c.id, clientName: c.name,
                        clientEmail: c.contact, type: "G50",
                        label: `G50 ${d.due.slice(0, 7)} — ${fmtDZD(d.amount)}`,
                        date: new Date().toLocaleDateString("fr-DZ"),
                        payload: JSON.stringify({ nif: c.taxId, bp: c.bp, amount: d.amount, due: d.due }),
                        workflow: "sent",
                      };
                      setSharedDocs((p) => [shared, ...p]);
                      pushNotification({
                        forRole: "client", forEmail: c.contact,
                        title: t("notif_g50_ready_title"),
                        message: t("notif_g50_ready_msg").replace("{label}", shared.label),
                        type: "g50_ready", link: "/dashboard/client", refId: shared.id,
                      });
                      toast.success(t("tools_send_to_client"));
                    }}
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
                    onDelete={(id) => setDecls((p) => p.filter((x) => x.id !== id))} showType />
                </Card>
              </div>
            )}

            {view === "tools" && (
              <Card className="p-5 shadow-card border-gold/30 bg-gradient-to-br from-card to-gold/5">
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
                    cta={t("tools_open")} onClick={() => setOpenTool("g50")} disabled={clients.length === 0} />
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
              <ReportsView t={t} journal={journal} locks={locks}
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
        onAdd={(c) => { setClients((p) => [c, ...p]); setOpenAdd(false); }} t={t} />

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
        }}
        t={t}
      />

      <FinancialStatementsDialog
        open={openTool === "fs"} onOpenChange={(o) => !o && setOpenTool(null)}
        clients={clients} t={t}
        onSave={(fs) => { setFsList((p) => [fs, ...p]); setOpenTool(null); }}
      />
      <G50GeneratorDialog
        open={openTool === "g50"} onOpenChange={(o) => !o && setOpenTool(null)}
        clients={clients} t={t}
        getAggregates={(cid) => aggregateForG50(cid, bills, employees)}
        getLiveG50={(cid, period) => computeG50FromJournal(journal, { clientId: cid, period })}
        onGenerate={(d, shared, lockOpts) => {
          setDecls((p) => [d, ...p]);
          if (shared) {
            setSharedDocs((p) => [shared, ...p]);
            pushNotification({
              forRole: "client",
              forEmail: shared.clientEmail,
              title: t("notif_g50_ready_title"),
              message: t("notif_g50_ready_msg").replace("{label}", shared.label),
              type: "g50_ready",
              link: "/dashboard/client",
              refId: shared.id,
            });
          }
          if (lockOpts) setLocks((p) => lockPeriod(p, lockOpts));
          setOpenTool(null);
        }}
      />
      <SendDocumentDialog
        open={openTool === "send"} onOpenChange={(o) => !o && setOpenTool(null)}
        clients={clients} t={t}
        onSend={(doc) => {
          setSharedDocs((p) => [doc, ...p]);
          pushNotification({
            forRole: "client",
            forEmail: doc.clientEmail,
            title: t("notif_g50_ready_title"),
            message: t("notif_g50_ready_msg").replace("{label}", doc.label),
            type: "g50_ready",
            link: "/dashboard/client",
            refId: doc.id,
          });
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

      {/* Preview incoming invoice */}
      <DocPreviewDialog
        open={!!previewIncoming}
        onClose={() => setPreviewIncoming(null)}
        title={previewIncoming?.fileName || ""}
        fileName={previewIncoming?.fileName}
        mimeType={previewIncoming?.mimeType}
        fileData={previewIncoming?.fileData}
        meta={previewIncoming ? { client: previewIncoming.clientName, size: `${(previewIncoming.size/1024).toFixed(0)} KB`, status: previewIncoming.status } : undefined}
        t={t}
      />

      {/* Review & Edit declaration */}
      <EditDeclDialog
        doc={editingShared}
        onClose={() => setEditingShared(null)}
        onSave={(id, payload, label, workflow) => {
          updateSharedDocPayload(id, payload, label);
          setSharedDocWorkflow(id, workflow);
          setSharedDocs((p) => p.map((s) => (s.id === id ? { ...s, payload, label, workflow } : s)));
        }}
        t={t}
      />

      {/* View / Edit a client's G50 (interactive preview) */}
      <ViewG50Dialog
        client={viewG50Client}
        onClose={() => setViewG50Client(null)}
        journal={journal}
        t={t}
        onFinalize={(decl, shared) => {
          setDecls((p) => [decl, ...p]);
          setSharedDocs((p) => [shared, ...p]);
          pushNotification({
            forRole: "client", forEmail: shared.clientEmail,
            title: t("notif_g50_ready_title"),
            message: t("notif_g50_ready_msg").replace("{label}", shared.label),
            type: "g50_ready", link: "/dashboard/client", refId: shared.id,
          });
          toast.success(t("g50_finalized_sent"));
          setViewG50Client(null);
        }}
      />

      <ChatSidebar
        t={t}
        role="accountant"
        selfName={user.name}
        contacts={clients.map((c) => ({ email: c.contact, name: c.name }))}
      />
    </div>
  );
};

/* ============== VIEWS ============== */

const DashboardView = ({
  t, user, clients, invoices, decls, totalRevenue, pendingInvoices, pendingTax, onGoClients, onAddClient, onOpenCalendar,
}: any) => (
  <>
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <Badge className="bg-gold/20 text-gold-deep border-gold/40 hover:bg-gold/30 mb-2">{t("dash_acc_title")}</Badge>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">
          {t("dash_acc_welcome")}, {user.name.split(" ")[0]}
        </h1>
      </div>
      <Button variant="gold" onClick={onAddClient}><Plus className="h-4 w-4" /> {t("acc_new_client")}</Button>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPI icon={Users} label={t("dash_active_clients")} value={String(clients.length)} tone="primary" />
      <KPI icon={FileText} label={t("dash_pending_invoices")} value={String(pendingInvoices)} tone="gold" />
      <KPI icon={TrendingUp} label={t("dash_monthly_revenue")} value={fmtDZD(totalRevenue)} tone="primary" />
      <KPI icon={AlertCircle} label={t("dash_pending_tax")} value={String(pendingTax)} tone="gold" />
    </div>

    <Card className="p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-primary">{t("dash_portfolio")}</h2>
        <Button variant="ghost" size="sm" onClick={onGoClients}>{t("dash_view_all")} <ChevronRight className="h-4 w-4" /></Button>
      </div>
      {clients.length === 0 ? (
        <EmptyState label={t("empty_no_clients")} />
      ) : (
        <div className="space-y-2">
          {clients.slice(0, 5).map((c: Client) => (
            <div key={c.id} className="flex items-center gap-3 p-2.5 rounded border border-border/60">
              <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{c.name}</div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">{c.taxId}</div>
              </div>
              <Badge variant="secondary" className="text-[10px] capitalize">{c.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>

    <FiscalCalendar t={t} limit={6} />
    {onOpenCalendar && (
      <div className="text-end">
        <Button variant="ghost" size="sm" onClick={onOpenCalendar}>{t("fcal_view_all")} <ChevronRight className="h-4 w-4" /></Button>
      </div>
    )}
  </>
);

const ClientsListView = ({
  t, clients, totalCount, search, setSearch, empCountByClient, onOpen, onAdd, onEdit, onDelete, onExtract, onViewG50, onCopyInvite,
}: {
  t: (k: string) => string; clients: Client[]; totalCount: number; search: string; setSearch: (v: string) => void;
  empCountByClient: Record<string, number>;
  onOpen: (c: Client) => void; onAdd: () => void; onEdit: (c: Client) => void; onDelete: (id: string) => void; onExtract: (c: Client) => void;
  onViewG50: (c: Client) => void;
  onCopyInvite: (c: Client) => void;
}) => (
  <>
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("side_clients")}</h1>
        <p className="text-xs text-muted-foreground">{totalCount} {t("acc_client_count")}</p>
      </div>
      <Button variant="gold" onClick={onAdd}><Plus className="h-4 w-4" /> {t("acc_new_client")}</Button>
    </div>

    <Card className="p-5 shadow-card">
      <div className="relative mb-4">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="ps-9" placeholder={t("acc_search_clients")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {clients.length === 0 ? (
        <EmptyState label={t("empty_no_clients")} />
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                <th className="text-start font-medium py-2.5">{t("client_section_identity")}</th>
                <th className="text-start font-medium py-2.5">{t("client_nif")}</th>
                <th className="text-start font-medium py-2.5">{t("client_bp")}</th>
                <th className="text-start font-medium py-2.5 hidden md:table-cell">{t("client_rc")}</th>
                <th className="text-start font-medium py-2.5 hidden md:table-cell">{t("client_tax_regime")}</th>
                <th className="text-start font-medium py-2.5 hidden lg:table-cell">{t("client_phone")}</th>
                <th className="text-start font-medium py-2.5">{t("dash_status")}</th>
                <th className="text-start font-medium py-2.5">{t("status_alert")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40 cursor-pointer"
                    onClick={() => onOpen(c)}>
                  <td className="py-3">
                    <div className="font-semibold">{c.name}</div>
                    {c.company && <div className="text-[11px] text-muted-foreground">{c.company}</div>}
                  </td>
                  <td className="py-3 font-mono text-xs text-muted-foreground">{c.taxId}</td>
                  <td className="py-3 font-mono text-xs text-muted-foreground">{c.bp || "—"}</td>
                  <td className="py-3 font-mono text-xs text-muted-foreground hidden md:table-cell">{c.rc || "—"}</td>
                  <td className="py-3 hidden md:table-cell">
                    {c.taxRegime ? (
                      <Badge variant="outline" className="text-[10px] border-primary/40 text-primary bg-primary/5 font-mono">
                        {c.taxRegime === "IFU" ? "IFU" : c.taxRegime === "REEL" ? "Réel" : "Simplifié"}
                      </Badge>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="py-3 text-muted-foreground hidden lg:table-cell">{c.phone || c.email || c.contact}</td>
                  <td className="py-3"><Badge variant="secondary" className="text-[10px] capitalize">{c.status}</Badge></td>
                  <td className="py-3">
                    <ClientStatusIcon t={t} regime={c.taxRegime} employeeCount={empCountByClient[c.id] || 0} hasCacobatph={c.hasCacobatph} />
                  </td>
                  <td className="py-3 text-end" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={() => onCopyInvite(c)} title="Copier le lien d'invitation">
                        <Link2 className="h-3.5 w-3.5" /> Copier invitation
                      </Button>
                      <Button size="sm" variant="gold" className="h-7 gap-1.5 text-xs" onClick={() => onViewG50(c)}>
                        <Receipt className="h-3.5 w-3.5" /> {t("acc_view_g50")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onExtract(c)}>
                        <FileDown className="h-3.5 w-3.5" /> {t("acc_extract")}
                      </Button>
                      <Button size="sm" variant="outlineGold" className="h-7 gap-1.5 text-xs" onClick={() => onEdit(c)}>
                        <Lock className="h-3 w-3" />
                        <Pencil className="h-3.5 w-3.5" /> {t("acc_edit")}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => onOpen(c)}>
                        {t("client_open_profile")} <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(c.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  </>
);

const ClientProfileView = ({
  t, client, decls, invoices, legalDocs, onBack, onAddLegal, onDeleteLegal, onAddDecl, onExtract,
}: {
  t: (k: string) => string; client: Client; decls: Decl[]; invoices: Invoice[]; legalDocs: LegalDoc[];
  onBack: () => void; onAddLegal: (d: LegalDoc) => void; onDeleteLegal: (id: string) => void;
  onAddDecl: (d: Decl) => void; onExtract: () => void;
}) => {
  const totalDue = decls.filter((d) => d.status !== "filed").reduce((s, d) => s + d.amount, 0);
  const filed = decls.filter((d) => d.status === "filed").length;
  const pending = decls.filter((d) => d.status !== "filed").length;
  const requiredTypes = client.taxRegime ? REGIME_DECLS[client.taxRegime] : [];
  const requiredSet = new Set<DeclType>(requiredTypes);
  // Obligations tab: only declarations relevant to the client's tax regime
  const obligations = decls.filter((d) => requiredSet.has(d.type));
  const social = decls.filter((d) => d.type === "CNAS" || d.type === "CASNOS" || d.type === "CACOBATPH");

  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack} className="-ms-2">
        <ArrowLeft className="h-4 w-4" /> {t("side_back")}
      </Button>

      {/* Header card */}
      <Card className="p-6 shadow-card border-primary/20 bg-gradient-to-br from-primary/5 to-card">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-14 w-14 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center text-xl font-bold shadow-elegant">
            {client.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-primary">{client.name}</h1>
              {client.taxRegime && (
                <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5 font-mono text-[10px]">
                  {t(regimeLabelKey(client.taxRegime))}
                </Badge>
              )}
            </div>
            {client.company && <p className="text-sm text-muted-foreground">{client.company}</p>}
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
              {client.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {client.email}</span>}
              {client.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {client.phone}</span>}
              {client.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {client.address}</span>}
            </div>
          </div>
          <Button variant="gold" size="sm" onClick={onExtract}>
            <FileDown className="h-4 w-4" /> {t("acc_extract")}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-5 border-t border-border/60">
          <InfoCell label="NIF" value={client.taxId} />
          <InfoCell label={t("client_bp")} value={client.bp} />
          <InfoCell label="NIS" value={client.nis} />
          <InfoCell label="RC" value={client.rc} />
          <InfoCell label={t("client_cnas_no")} value={client.cnasNo} sub={client.hasCacobatph ? "BTPH" : undefined} />
          <InfoCell label={t("client_casnos_no")} value={client.casnosNo} />
        </div>
        {client.hasCacobatph && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-gold-deep/40 bg-gold-deep/10 px-2.5 py-1 text-[11px] font-medium text-gold-deep">
            <ShieldCheck className="h-3 w-3" /> {t("client_btph_indicator")}
          </div>
        )}
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="overview">{t("profile_tab_overview")}</TabsTrigger>
          <TabsTrigger value="files">Fichiers</TabsTrigger>
          <TabsTrigger value="legal">{t("profile_tab_legal")}</TabsTrigger>
          <TabsTrigger value="obligations">{t("profile_tab_obligations")}</TabsTrigger>
          <TabsTrigger value="social">{t("profile_tab_social")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KPI icon={AlertCircle} label={t("profile_total_due")} value={fmtDZD(totalDue)} tone="gold" />
            <KPI icon={FileCheck2} label={t("profile_filed")} value={String(filed)} tone="primary" />
            <KPI icon={Receipt} label={t("profile_pending")} value={String(pending)} tone="gold" />
          </div>
          <Card className="p-5 shadow-card">
            <h3 className="font-semibold text-primary mb-3">{t("dash_recent_invoices")}</h3>
            {invoices.length === 0 ? <EmptyState label={t("empty_no_invoices")} /> : (
              <InvoiceTable invoices={invoices} t={t} compact />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <ClientFilesSection
            clientEmail={client.email || client.contact}
            clientName={client.name}
            t={t}
          />
        </TabsContent>

        <TabsContent value="legal" className="mt-4">
          <Card className="p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" /> {t("profile_tab_legal")}
                </h3>
                <p className="text-xs text-muted-foreground">{t("profile_legal_subtitle")}</p>
              </div>
              <UploadLegalDialog clientId={client.id} onAdd={onAddLegal} t={t} />
            </div>
            {legalDocs.length === 0 ? (
              <EmptyState label={t("profile_no_legal")} />
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {legalDocs.map((d) => (
                  <div key={d.id} className="p-3 rounded-lg border border-border/60 flex items-center gap-3 bg-card">
                    <div className="p-2 rounded bg-gold/10 text-gold-deep"><FileText className="h-4 w-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{d.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] me-1.5 font-mono">{d.kind}</Badge>
                        {d.date}{d.fileName ? ` • ${d.fileName}` : ""}
                      </div>
                    </div>
                    {d.fileData && (
                      <a href={d.fileData} download={d.fileName || `${d.label}.bin`}>
                        <Button size="icon" variant="ghost" className="h-8 w-8"><Download className="h-3.5 w-3.5" /></Button>
                      </a>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onDeleteLegal(d.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="obligations" className="mt-4">
          <Card className="p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> {t("profile_tab_obligations")}
                </h3>
                <p className="text-xs text-muted-foreground">{t("profile_obligations_subtitle")}</p>
              </div>
              <AddDeclarationDialog clients={[client]} type="G50" onAdd={onAddDecl} t={t} />
            </div>

            {client.taxRegime ? (
              <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] uppercase tracking-wide text-primary font-semibold">
                    {t("client_required_decls")}
                  </span>
                  <Badge variant="outline" className="text-[10px] border-primary/40 text-primary bg-background font-mono">
                    {t(regimeLabelKey(client.taxRegime))}
                  </Badge>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {requiredTypes.map((type) => (
                    <div key={type} className="flex items-center gap-2 rounded border border-border/60 bg-card p-2">
                      <Badge variant="outline" className="font-mono text-[10px] border-gold-deep/40 text-gold-deep bg-gold/5">{type}</Badge>
                      <span className="text-xs text-muted-foreground truncate">{t(declLabelKey(type))}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  {client.taxRegime === "IFU" ? t("client_tax_regime_hint_ifu") : t("client_tax_regime_hint_real")}
                </p>
              </div>
            ) : (
              <div className="mb-4 rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                {t("client_tax_regime_placeholder")}
              </div>
            )}

            <DeclList items={obligations} t={t} onDelete={() => {}} showType />
          </Card>
        </TabsContent>

        <TabsContent value="social" className="mt-4">
          <Card className="p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> {t("profile_tab_social")}
                </h3>
                <p className="text-xs text-muted-foreground">{t("profile_social_subtitle")}</p>
              </div>
              <AddDeclarationDialog clients={[client]} type="CNAS" onAdd={onAddDecl} t={t} social />
            </div>
            <DeclList items={social} t={t} onDelete={() => {}} showType />
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
};

const InfoCell = ({ label, value, sub }: { label: string; value?: string; sub?: string }) => (
  <div className="p-3 rounded-lg bg-card border border-border/60">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="font-mono text-sm font-semibold text-foreground truncate">{value || "—"}</div>
    {sub && <div className="text-[10px] text-gold-deep mt-0.5">{sub}</div>}
  </div>
);

const InvoiceTable = ({ invoices, t, onDelete, compact }: { invoices: Invoice[]; t: (k: string) => string; onDelete?: (id: string) => void; compact?: boolean }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs uppercase text-muted-foreground border-b border-border">
          <th className="text-start font-medium py-2.5">ID</th>
          {!compact && <th className="text-start font-medium py-2.5">{t("dash_client")}</th>}
          <th className="text-start font-medium py-2.5">{t("dash_amount")}</th>
          <th className="text-start font-medium py-2.5 hidden sm:table-cell">{t("dash_date")}</th>
          <th className="text-start font-medium py-2.5">{t("dash_status")}</th>
          {onDelete && <th></th>}
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
            <td className="py-3 font-mono text-xs text-muted-foreground">{inv.id}</td>
            {!compact && <td className="py-3 font-medium">{inv.clientName}</td>}
            <td className="py-3 font-semibold text-gold-deep">{fmtDZD(inv.amount)}</td>
            <td className="py-3 text-muted-foreground hidden sm:table-cell">{inv.date}</td>
            <td className="py-3"><Badge variant="outline" className="capitalize text-[10px]">{inv.status}</Badge></td>
            {onDelete && (
              <td className="py-3 text-end">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(inv.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* ============== SHARED COMPONENTS ============== */

const EmptyState = ({ label }: { label: string }) => (
  <div className="text-center py-10 border border-dashed border-border rounded-lg">
    <div className="inline-flex p-3 rounded-full bg-muted text-muted-foreground mb-3">
      <Inbox className="h-6 w-6" />
    </div>
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
);

const KPI = ({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: "primary" | "gold" }) => (
  <Card className="p-4 sm:p-5 shadow-card hover:shadow-elegant transition-smooth">
    <div className={`inline-flex p-2 rounded-lg ${tone === "primary" ? "bg-primary/10 text-primary" : "bg-gold/15 text-gold-deep"}`}>
      <Icon className="h-4 w-4" />
    </div>
    <div className="text-xl sm:text-2xl font-bold mt-3 text-foreground truncate">{value}</div>
    <div className="text-xs text-muted-foreground mt-1">{label}</div>
  </Card>
);

/* ============== ADD CLIENT (full Algerian form) ============== */

const AddClientDialog = ({
  open, onOpenChange, onAdd, t, mode = "create", initial, onUpdate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (c: Client) => void;
  t: (k: string) => string;
  mode?: "create" | "edit";
  initial?: Client | null;
  onUpdate?: (c: Client) => void;
}) => {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [legalForm, setLegalForm] = useState("");
  const [activity, setActivity] = useState("");
  const [taxId, setTaxId] = useState("");
  const [bp, setBp] = useState("");
  const [nis, setNis] = useState("");
  const [rc, setRc] = useState("");
  const [cnasNo, setCnasNo] = useState("");
  const [casnosNo, setCasnosNo] = useState("");
  const [hasCacobatph, setHasCacobatph] = useState(false);
  const [taxRegime, setTaxRegime] = useState<TaxRegime | "">("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const reset = () => {
    setName(""); setCompany(""); setLegalForm(""); setActivity("");
    setTaxId(""); setBp(""); setNis(""); setRc("");
    setCnasNo(""); setCasnosNo(""); setHasCacobatph(false);
    setTaxRegime("");
    setEmail(""); setPhone(""); setAddress("");
  };

  // Seed form when entering edit mode (or when the target client changes).
  useEffect(() => {
    if (mode === "edit" && initial && open) {
      setName(initial.name || "");
      setCompany(initial.company || "");
      setLegalForm(initial.legalForm || "");
      setActivity(initial.activity || "");
      setTaxId(initial.taxId || "");
      setBp(initial.bp || "");
      setNis(initial.nis || "");
      setRc(initial.rc || "");
      setCnasNo(initial.cnasNo || "");
      setCasnosNo(initial.casnosNo || "");
      setHasCacobatph(!!initial.hasCacobatph);
      setTaxRegime((initial.taxRegime as TaxRegime) || "");
      setEmail(initial.email || "");
      setPhone(initial.phone || "");
      setAddress(initial.address || "");
    }
  }, [mode, initial, open]);

  const submit = () => {
    if (!name.trim() || !taxId.trim() || !legalForm || !taxRegime) {
      toast.error([t("acc_client_name"), t("client_nif"), t("client_legal_form"), t("client_tax_regime")].join(" • "));
      return;
    }
    const payload: Client = {
      id: mode === "edit" && initial ? initial.id : crypto.randomUUID(),
      name: name.trim(), company: company.trim() || undefined,
      legalForm: legalForm.trim() || undefined, activity: activity.trim() || undefined,
      taxId: taxId.trim(), bp: bp.trim() || undefined, nis: nis.trim() || undefined, rc: rc.trim() || undefined,
      cnasNo: cnasNo.trim() || undefined, casnosNo: casnosNo.trim() || undefined, hasCacobatph,
      taxRegime: taxRegime as TaxRegime,
      email: email.trim() || undefined, phone: phone.trim() || undefined, address: address.trim() || undefined,
      contact: email.trim() || (initial?.contact ?? ""),
      status: initial?.status ?? "active",
    };
    if (mode === "edit" && onUpdate) {
      onUpdate(payload);
      toast.success(t("edit_client_saved"));
    } else {
      onAdd(payload);
      toast.success("Client ajouté");
      reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o && mode === "create") reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "edit"
              ? <><Pencil className="h-5 w-5 text-gold-deep" /> {t("edit_client_title")}</>
              : <><Building2 className="h-5 w-5 text-gold-deep" /> {t("acc_new_client")}</>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <Section title={t("client_section_identity")} icon={IdCard}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t("acc_client_name") + " *"}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mohamed Benali" /></Field>
              <Field label={t("client_company")}><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme SARL" /></Field>
              <Field label={t("client_legal_form") + " *"}>
                <Select value={legalForm} onValueChange={setLegalForm}>
                  <SelectTrigger><SelectValue placeholder={t("client_legal_form_placeholder")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PP">{t("client_legal_form_pp")}</SelectItem>
                    <SelectItem value="SARL">{t("client_legal_form_sarl")}</SelectItem>
                    <SelectItem value="EURL">{t("client_legal_form_eurl")}</SelectItem>
                    <SelectItem value="SNC">{t("client_legal_form_snc")}</SelectItem>
                    <SelectItem value="SPA">{t("client_legal_form_spa")}</SelectItem>
                    <SelectItem value="SPA-AD">{t("client_legal_form_spa_ad")}</SelectItem>
                    <SelectItem value="GROUPEMENT">{t("client_legal_form_groupement")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("client_activity")}><Input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Commerce de gros" /></Field>
            </div>
          </Section>

          <Section title={t("client_section_tax")} icon={IdCard}>
            <div className={legalForm === "PP" ? "rounded-md border border-gold-deep/40 bg-gold-deep/5 p-3" : ""}>
              {legalForm === "PP" && (
                <p className="text-[12px] text-gold-deep font-medium mb-2 flex items-center gap-1">
                  <IdCard className="h-3.5 w-3.5" /> {t("client_pp_hint")}
                </p>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label={t("client_nif") + " *"}><Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="000016001234567" className="font-mono" /></Field>
                <Field label={t("client_bp")}><Input value={bp} onChange={(e) => setBp(e.target.value)} placeholder="16xxxxxxxx" className="font-mono" /></Field>
                <Field label={t("client_tax_regime") + " *"} full>
                  <Select value={taxRegime} onValueChange={(v) => setTaxRegime(v as TaxRegime)}>
                    <SelectTrigger><SelectValue placeholder={t("client_tax_regime_placeholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="REEL">{t("client_tax_regime_reel")}</SelectItem>
                      <SelectItem value="SIMPLIFIE">{t("client_tax_regime_simplifie")}</SelectItem>
                      <SelectItem value="IFU">{t("client_tax_regime_ifu")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {taxRegime && (
                <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-2.5">
                  <div className="text-[11px] uppercase tracking-wide text-primary font-semibold mb-1">
                    {t("client_required_decls")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {REGIME_DECLS[taxRegime as TaxRegime].map((d) => (
                      <Badge key={d} variant="outline" className="font-mono text-[10px] border-gold-deep/40 text-gold-deep bg-gold/5">{d}</Badge>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {taxRegime === "IFU" ? t("client_tax_regime_hint_ifu") : t("client_tax_regime_hint_real")}
                  </p>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-2">
                NIF & Business Partner (BP) — Identifiant Jibayatic / Carte d'Immatriculation Fiscale
              </p>
            </div>
          </Section>

          <Section title={t("client_section_legal")} icon={FileText}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t("client_nis")}><Input value={nis} onChange={(e) => setNis(e.target.value)} placeholder="0916 0000123456 78" className="font-mono" /></Field>
              <Field label={t("client_rc")}><Input value={rc} onChange={(e) => setRc(e.target.value)} placeholder="16/00 - 1234567 B 24" className="font-mono" /></Field>
            </div>
          </Section>

          <Section title={t("client_section_social")} icon={ShieldCheck}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t("client_cnas_no")}>
                <Input value={cnasNo} onChange={(e) => setCnasNo(e.target.value)} placeholder="N° CNAS" className="font-mono" />
              </Field>
              <Field label={t("client_casnos_no")}>
                <Input value={casnosNo} onChange={(e) => setCasnosNo(e.target.value)} placeholder="N° CASNOS" className="font-mono" />
              </Field>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Switch id="cacobatph" checked={hasCacobatph} onCheckedChange={setHasCacobatph} />
                <label htmlFor="cacobatph" className="text-sm font-medium cursor-pointer">
                  {t("client_has_cacobatph")}
                </label>
              </div>
              {hasCacobatph && (
                <span className="inline-flex items-center gap-1 rounded-md border border-gold-deep/40 bg-gold-deep/10 px-2 py-0.5 text-[11px] font-semibold text-gold-deep">
                  <ShieldCheck className="h-3 w-3" /> BTPH
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">{t("client_social_hint")}</p>
          </Section>

          <Section title={t("client_section_contact")} icon={Mail}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t("client_email")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@acme.dz" /></Field>
              <Field label={t("client_phone")}><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+213 555 12 34 56" /></Field>
              <Field label={t("client_address")} full><Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue, ville, wilaya" rows={2} /></Field>
            </div>
          </Section>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{t("acc_save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ============== SECURE EDIT LOCK ============== */

const LockDialog = ({
  open, onOpenChange, onUnlock, t,
}: { open: boolean; onOpenChange: (o: boolean) => void; onUnlock: () => void; t: (k: string) => string }) => {
  const { user } = useApp();
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { if (!open) { setPw(""); setError(""); } }, [open]);

  const verify = () => {
    if (!user) { setError(t("edit_lock_no_account")); return; }
    const raw = localStorage.getItem("mgmtk_accounts");
    const accounts: Record<string, { password: string }> = raw ? JSON.parse(raw) : {};
    const acc = accounts[user.email.toLowerCase()];
    if (!acc) { setError(t("edit_lock_no_account")); return; }
    if (acc.password !== pw) { setError(t("edit_lock_wrong")); return; }
    onUnlock();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Lock className="h-4 w-4 text-gold-deep" /> {t("edit_lock_title")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("edit_lock_subtitle")}</p>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("edit_lock_password")}</Label>
            <Input
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => { setPw(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") verify(); }}
              placeholder="••••••••"
            />
            {error && (
              <p className="text-[11px] text-destructive font-medium flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {error}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("edit_lock_cancel")}</Button>
          <Button variant="hero" onClick={verify} disabled={!pw}>
            <Lock className="h-3.5 w-3.5" /> {t("edit_lock_unlock")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Section = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
  <div>
    <div className="flex items-center gap-2 mb-2">
      <div className="p-1.5 rounded bg-primary/10 text-primary"><Icon className="h-3.5 w-3.5" /></div>
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
    </div>
    {children}
  </div>
);

const Field = ({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) => (
  <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);

/* ============== UPLOAD LEGAL DOC ============== */

const UploadLegalDialog = ({ clientId, onAdd, t }: { clientId: string; onAdd: (d: LegalDoc) => void; t: (k: string) => string }) => {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<LegalDoc["kind"]>("RC");
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState("");

  const onFileChange = (f: File | null) => {
    setFile(f);
    if (!f) { setFileData(""); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setFileData(reader.result as string);
    reader.readAsDataURL(f);
  };

  const submit = () => {
    if (!label.trim()) { toast.error(t("profile_doc_label")); return; }
    onAdd({
      id: crypto.randomUUID(), clientId, label: label.trim(), kind,
      fileName: file?.name, mimeType: file?.type, fileData: fileData || undefined,
      date: new Date().toLocaleDateString("fr-DZ"),
    });
    toast.success("Document ajouté");
    setLabel(""); setKind("RC"); setFile(null); setFileData(""); setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold" size="sm"><Upload className="h-4 w-4" /> {t("profile_upload_doc")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("profile_upload_doc")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label={t("tools_doc_type")}>
            <Select value={kind} onValueChange={(v) => setKind(v as LegalDoc["kind"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RC">RC — Registre du Commerce</SelectItem>
                <SelectItem value="NIF">NIF — Carte fiscale</SelectItem>
                <SelectItem value="NIS">NIS — Identif. statistique</SelectItem>
                <SelectItem value="STATUTS">Statuts</SelectItem>
                <SelectItem value="OTHER">{t("tools_doc_other")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("profile_doc_label")}><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Extrait RC 2024" /></Field>
          <Field label="Fichier (PDF / Image, max 5 MB)">
            <Input type="file" accept="application/pdf,image/*" onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
            {file && <p className="text-xs text-muted-foreground mt-1">{file.name} • {(file.size / 1024).toFixed(0)} KB</p>}
          </Field>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{t("acc_save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ============== EXISTING DIALOGS (kept) ============== */

const AddInvoiceDialog = ({ clients, onAdd, t }: { clients: Client[]; onAdd: (i: Invoice) => void; t: (k: string) => string }) => {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [amount, setAmount] = useState("");
  const submit = () => {
    const c = clients.find((x) => x.id === clientId);
    if (!c || !amount) { toast.error("Client & montant requis"); return; }
    onAdd({
      id: `INV-${Date.now().toString().slice(-5)}`,
      clientId: c.id, clientName: c.name,
      amount: Number(amount),
      date: new Date().toLocaleDateString("fr-DZ"),
      status: "pending",
    });
    toast.success("Facture ajoutée");
    setClientId(""); setAmount(""); setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="hero" size="sm" disabled={clients.length === 0}><Plus className="h-4 w-4" /> {t("acc_add_invoice")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("acc_add_invoice")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("dash_client")}</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder={t("acc_select_client")} /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t("dash_amount")} (DA)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="120000" /></div>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{t("acc_save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AddDeclarationDialog = ({
  clients, type, onAdd, t, social,
}: { clients: Client[]; type: Decl["type"]; onAdd: (d: Decl) => void; t: (k: string) => string; social?: boolean }) => {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(clients.length === 1 ? clients[0].id : "");
  const [declType, setDeclType] = useState<Decl["type"]>(type);
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const submit = () => {
    const c = clients.find((x) => x.id === clientId);
    if (!c || !amount || !due) { toast.error("Champs requis"); return; }
    onAdd({
      id: crypto.randomUUID(),
      clientId: c.id, clientName: c.name,
      type: declType, amount: Number(amount), due, status: "upcoming",
    });
    toast.success("Déclaration ajoutée");
    setClientId(clients.length === 1 ? clients[0].id : ""); setAmount(""); setDue(""); setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={clients.length === 0}><Plus className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{social ? t("acc_add_social") : t("acc_add_g50")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {clients.length > 1 && (
            <div className="space-y-1.5">
              <Label>{t("dash_client")}</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder={t("acc_select_client")} /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {social && (
            <div className="space-y-1.5">
              <Label>Organisme</Label>
              <Select value={declType} onValueChange={(v) => setDeclType(v as Decl["type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNAS">CNAS</SelectItem>
                  <SelectItem value="CASNOS">CASNOS</SelectItem>
                  <SelectItem value="CACOBATPH">CACOBATPH</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label>{t("dash_amount")} (DA)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" /></div>
          <div className="space-y-1.5"><Label>{t("dash_deadline")}</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{t("acc_save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DeclList = ({ items, onDelete, t, showType, onSend, sharedDocs, onReview }: {
  items: Decl[]; onDelete: (id: string) => void; t: (k: string) => string;
  showType?: boolean; onSend?: (d: Decl) => void;
  sharedDocs?: SharedDoc[]; onReview?: (s: SharedDoc) => void;
}) => {
  if (items.length === 0) return <EmptyState label={t("empty_no_decls")} />;
  const findShared = (d: Decl): SharedDoc | undefined => {
    if (!sharedDocs) return undefined;
    const period = d.due.slice(0, 7);
    return sharedDocs.find((s) => s.clientId === d.clientId && s.type === d.type && s.label.includes(period))
      || sharedDocs.find((s) => s.clientId === d.clientId && s.type === d.type);
  };
  return (
    <div className="space-y-2">
      {items.map((d) => {
        const shared = findShared(d);
        return (
          <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{d.clientName}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                {showType && <Badge variant="outline" className="text-[10px] font-mono">{d.type}</Badge>}
                <span>{t("dash_deadline")}: {d.due}</span>
                {shared && <WorkflowBadge status={shared.workflow} t={t} />}
              </div>
            </div>
            <div className="text-end">
              <div className="font-bold text-sm text-gold-deep">{fmtDZD(d.amount)}</div>
              <Badge variant="outline" className="text-[10px]">{t(`dash_${d.status}`)}</Badge>
            </div>
            {shared && onReview && (
              <Button size="sm" variant="outline" onClick={() => onReview(shared)} title={t("wf_review_edit")}>
                <Pencil className="h-3.5 w-3.5" /> {t("wf_review_edit")}
              </Button>
            )}
            {onSend && (
              <Button size="sm" variant="outlineGold" onClick={() => onSend(d)} title={t("tools_send_to_client")}>
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(d.id)}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        );
      })}
    </div>
  );
};

const ToolCard = ({ icon: Icon, title, subtitle, cta, onClick, disabled }: {
  icon: any; title: string; subtitle: string; cta: string; onClick: () => void; disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="text-start p-4 rounded-xl border border-border/60 bg-card hover:border-gold/60 hover:shadow-gold transition-smooth disabled:opacity-50 disabled:cursor-not-allowed group"
  >
    <div className="inline-flex p-2 rounded-lg bg-gradient-gold text-gold-foreground shadow-gold mb-3 group-hover:scale-105 transition-smooth">
      <Icon className="h-4 w-4" />
    </div>
    <div className="font-semibold text-sm text-foreground mb-1">{title}</div>
    <div className="text-xs text-muted-foreground mb-3">{subtitle}</div>
    <div className="text-xs font-semibold text-gold-deep">{cta} →</div>
  </button>
);

const FinancialStatementsDialog = ({
  open, onOpenChange, clients, t, onSave,
}: { open: boolean; onOpenChange: (o: boolean) => void; clients: Client[]; t: (k: string) => string; onSave: (fs: FinStmt) => void }) => {
  const [clientId, setClientId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [assets, setAssets] = useState("");
  const [liab, setLiab] = useState("");
  const [equity, setEquity] = useState("");
  const [revenue, setRevenue] = useState("");
  const [net, setNet] = useState("");
  const submit = () => {
    const c = clients.find((x) => x.id === clientId);
    if (!c || !year || !assets) { toast.error("Champs requis"); return; }
    onSave({
      id: crypto.randomUUID(), clientId: c.id, clientName: c.name, year,
      assets: Number(assets), liabilities: Number(liab || 0), equity: Number(equity || 0),
      revenue: Number(revenue || 0), netResult: Number(net || 0),
      createdAt: new Date().toLocaleDateString("fr-DZ"),
    });
    toast.success("Bilan enregistré");
    setClientId(""); setAssets(""); setLiab(""); setEquity(""); setRevenue(""); setNet("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-gold-deep" /> {t("tools_fs_title")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("dash_client")}</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder={t("acc_select_client")} /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("tools_year")}</Label>
              <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2024" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>{t("tools_assets")} (DA)</Label><Input type="number" value={assets} onChange={(e) => setAssets(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t("tools_liabilities")} (DA)</Label><Input type="number" value={liab} onChange={(e) => setLiab(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t("tools_equity")} (DA)</Label><Input type="number" value={equity} onChange={(e) => setEquity(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t("tools_revenue")} (DA)</Label><Input type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} /></div>
            <div className="space-y-1.5 col-span-2"><Label>{t("tools_net_result")} (DA)</Label><Input type="number" value={net} onChange={(e) => setNet(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{t("tools_save_fs")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const G50GeneratorDialog = ({
  open, onOpenChange, clients, t, onGenerate, getAggregates, getLiveG50,
}: { open: boolean; onOpenChange: (o: boolean) => void; clients: Client[]; t: (k: string) => string;
     onGenerate: (
       d: Decl,
       shared: SharedDoc | null,
       lockOpts: { clientId?: string; period: string; reference: string } | null,
     ) => void;
     getAggregates?: (clientId: string) => { caHt: number; tvaCollected: number; tvaDeductible: number; tvaDue: number; salaries: number };
     getLiveG50?: (clientId: string | undefined, period: string) => {
       caHt: number; tvaDue: number; salaries: number; irgSalaries: number; tap: number; ibs: number; total: number;
     } }) => {
  const [clientId, setClientId] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [caHt, setCaHt] = useState("");
  const [salaries, setSalaries] = useState("");
  const [benefice, setBenefice] = useState("");
  const [rTap, setRTap] = useState("2");
  const [rTva, setRTva] = useState("19");
  const [rIrg, setRIrg] = useState("10");
  const [rIbs, setRIbs] = useState("23");
  const [synced, setSynced] = useState(false);
  const [validateAndLock, setValidateAndLock] = useState(true);

  // Auto-fill from live journal aggregates when client/period changes
  useEffect(() => {
    if (!clientId) { setSynced(false); return; }
    if (getLiveG50) {
      const live = getLiveG50(clientId, period);
      if (live.caHt > 0 || live.salaries > 0) {
        if (live.caHt > 0) setCaHt(String(live.caHt));
        if (live.salaries > 0) setSalaries(String(live.salaries));
        setSynced(true);
        return;
      }
    }
    if (getAggregates) {
      const agg = getAggregates(clientId);
      if (agg.caHt > 0 || agg.salaries > 0) {
        if (agg.caHt > 0) setCaHt(String(agg.caHt));
        if (agg.salaries > 0) setSalaries(String(agg.salaries));
        setSynced(true);
        return;
      }
    }
    setSynced(false);
  }, [clientId, period, getLiveG50, getAggregates]);

  const tap = (Number(caHt || 0) * Number(rTap || 0)) / 100;
  const tva = (Number(caHt || 0) * Number(rTva || 0)) / 100;
  const irg = (Number(salaries || 0) * Number(rIrg || 0)) / 100;
  const ibs = (Number(benefice || 0) * Number(rIbs || 0)) / 100;
  const total = tap + tva + irg + ibs;

  const submit = () => {
    const c = clients.find((x) => x.id === clientId);
    if (!c || !period || total <= 0) { toast.error("Champs requis"); return; }
    const declId = crypto.randomUUID();
    const decl: Decl = {
      id: declId, clientId: c.id, clientName: c.name,
      type: "G50", amount: Math.round(total), due: `${period}-20`, status: validateAndLock ? "filed" : "upcoming",
    };
    const shared: SharedDoc = {
      id: crypto.randomUUID(), clientId: c.id, clientName: c.name,
      clientEmail: c.contact, type: "G50",
      label: `G50 ${period} — ${fmtDZD(total)}`,
      date: new Date().toLocaleDateString("fr-DZ"),
      payload: JSON.stringify({ nif: c.taxId, bp: c.bp, caHt, salaries, benefice, rTap, rTva, rIrg, rIbs, tap, tva, irg, ibs, total, period }),
      workflow: validateAndLock ? "filed" : "draft",
    };
    const lockOpts = validateAndLock
      ? { clientId: c.id, period, reference: declId }
      : null;
    onGenerate(decl, shared, lockOpts);
    toast.success(validateAndLock ? t("eng_g50_filed_locked") : "G50 généré et envoyé au client");
    setClientId(""); setCaHt(""); setSalaries(""); setBenefice("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-gold-deep" /> {t("tools_g50_title")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("dash_client")}</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder={t("acc_select_client")} /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("tools_g50_period")}</Label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
          </div>

          {(() => {
            const sel = clients.find((c) => c.id === clientId);
            if (!sel) return null;
            return (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("client_nif")}</div>
                  <div className="font-mono text-sm font-semibold">{sel.taxId || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("client_bp")}</div>
                  <div className="font-mono text-sm font-semibold">{sel.bp || "—"}</div>
                </div>
              </div>
            );
          })()}

          {synced && (
            <div className="rounded-md border border-gold-deep/40 bg-gold-deep/5 px-3 py-2 text-[11px] text-gold-deep flex items-center gap-2">
              <Calculator className="h-3.5 w-3.5" /> {t("sync_from_modules")}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-semibold text-primary uppercase">Bases imposables</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Chiffre d'affaires HT (DA)</Label><Input type="number" value={caHt} onChange={(e) => setCaHt(e.target.value)} placeholder="1000000" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Salaires bruts (DA)</Label><Input type="number" value={salaries} onChange={(e) => setSalaries(e.target.value)} placeholder="200000" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Bénéfice imposable (DA)</Label><Input type="number" value={benefice} onChange={(e) => setBenefice(e.target.value)} placeholder="150000" /></div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-primary uppercase">Taux & calcul automatique</div>
            <div className="space-y-1.5">
              <CalcRow label={`${t("tools_g50_tap")} (TAP)`} rate={rTap} setRate={setRTap} amount={tap} />
              <CalcRow label={t("tools_g50_tva")} rate={rTva} setRate={setRTva} amount={tva} />
              <CalcRow label={`${t("tools_g50_irg")} / Salaires`} rate={rIrg} setRate={setRIrg} amount={irg} />
              <CalcRow label={t("tools_g50_ibs")} rate={rIbs} setRate={setRIbs} amount={ibs} />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-gradient-to-br from-gold/15 to-gold/5 border border-gold/40 flex items-center justify-between">
            <span className="text-sm font-semibold text-primary">{t("tools_g50_total")}</span>
            <span className="text-2xl font-bold text-gold-deep">{fmtDZD(total)}</span>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer rounded-md border border-border/60 p-2.5 hover:bg-muted/40">
            <Switch checked={validateAndLock} onCheckedChange={setValidateAndLock} />
            <div className="flex-1">
              <div className="font-semibold text-primary">{t("eng_validate_and_lock")}</div>
              <div className="text-[11px] text-muted-foreground">{t("eng_validate_and_lock_hint")}</div>
            </div>
          </label>
        </div>
        <DialogFooter><Button onClick={submit} variant="gold">{t("tools_g50_generate")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CalcRow = ({ label, rate, setRate, amount }: { label: string; rate: string; setRate: (v: string) => void; amount: number }) => (
  <div className="grid grid-cols-12 gap-2 items-center p-2 rounded border border-border/60 bg-card">
    <Label className="col-span-5 text-xs">{label}</Label>
    <div className="col-span-3 flex items-center gap-1">
      <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="h-8 text-xs" />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
    <div className="col-span-4 text-end font-semibold text-sm text-gold-deep">{fmtDZD(amount)}</div>
  </div>
);

const SendDocumentDialog = ({
  open, onOpenChange, clients, t, onSend,
}: { open: boolean; onOpenChange: (o: boolean) => void; clients: Client[]; t: (k: string) => string; onSend: (d: SharedDoc) => void }) => {
  const [clientId, setClientId] = useState("");
  const [type, setType] = useState<SharedDoc["type"]>("G50");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<string>("");

  const onFileChange = (f: File | null) => {
    setFile(f);
    if (!f) { setFileData(""); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setFileData(reader.result as string);
    reader.readAsDataURL(f);
  };

  const submit = () => {
    const c = clients.find((x) => x.id === clientId);
    if (!c || !label) { toast.error("Champs requis"); return; }
    onSend({
      id: crypto.randomUUID(), clientId: c.id, clientName: c.name,
      clientEmail: c.contact, type, label,
      date: new Date().toLocaleDateString("fr-DZ"),
      fileName: file?.name, mimeType: file?.type, fileData: fileData || undefined,
    });
    toast.success("Document partagé avec le client");
    setClientId(""); setLabel(""); setType("G50"); setFile(null); setFileData("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-gold-deep" /> {t("tools_send_to_client")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("tools_select_customer")}</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder={t("acc_select_client")} /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("tools_doc_type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as SharedDoc["type"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="G50">{t("tools_doc_g50")}</SelectItem>
                <SelectItem value="CNAS">{t("tools_doc_cnas")}</SelectItem>
                <SelectItem value="FS">{t("tools_doc_fs")}</SelectItem>
                <SelectItem value="OTHER">{t("tools_doc_other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="G50 - Mars 2025" />
          </div>
          <div className="space-y-1.5">
            <Label>Fichier (PDF / Image, max 5 MB)</Label>
            <Input type="file" accept="application/pdf,image/*"
              onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
            {file && <p className="text-xs text-muted-foreground">{file.name} • {(file.size / 1024).toFixed(0)} KB</p>}
          </div>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{t("tools_send_to_client")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ============== INCOMING + VAULT VIEWS ============== */

const IncomingDocsView = ({ t, items, onMarkProcessed, onDelete, onPreview }: {
  t: (k: string) => string; items: IncomingInvoice[];
  onMarkProcessed: (id: string) => void; onDelete: (id: string) => void;
  onPreview: (it: IncomingInvoice) => void;
}) => {
  return (
    <Card className="p-5 shadow-card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          <InboxIcon className="h-4 w-4 text-gold-deep" /> {t("incoming_title")}
        </h2>
        <Badge variant="secondary" className="text-xs">{items.length}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t("incoming_subtitle")}</p>
      {items.length === 0 ? (
        <EmptyState label={t("incoming_empty")} />
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const statusBadge =
              it.status === "pending" ? <Badge className="bg-warning/15 text-warning-foreground border-warning/40 text-[10px]"><Clock className="h-3 w-3 me-1" /> {t("incoming_pending")}</Badge>
              : it.status === "processed" ? <Badge className="bg-success/15 text-success border-success/40 text-[10px]"><FileCheck2 className="h-3 w-3 me-1" /> {t("incoming_processed")}</Badge>
              : <Badge variant="outline" className="text-[10px]">{t("incoming_review")}</Badge>;
            return (
              <div key={it.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/40 transition-smooth">
                <div className="p-2 rounded-md bg-primary/10 text-primary flex-shrink-0">
                  {it.mimeType.startsWith("image/") ? <FileText className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{it.fileName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("incoming_from")} <span className="font-medium">{it.clientName}</span> • {(it.size / 1024).toFixed(0)} KB • {new Date(it.uploadedAt).toLocaleString("fr-DZ")}
                  </div>
                </div>
                {statusBadge}
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onPreview(it)}>
                  <Eye className="h-3.5 w-3.5" /> {t("preview_btn")}
                </Button>
                {it.fileData && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                    const a = document.createElement("a");
                    a.href = it.fileData!; a.download = it.fileName; a.target = "_blank"; a.click();
                  }} title={t("incoming_open_file")}>
                    <Download className="h-3.5 w-3.5 text-gold-deep" />
                  </Button>
                )}
                {it.status !== "processed" && (
                  <Button size="sm" variant="outlineGold" onClick={() => { onMarkProcessed(it.id); toast.success(t("incoming_processed")); }}>
                    {t("incoming_mark_processed")}
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(it.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

const AccountantVaultView = ({ t, entries }: { t: (k: string) => string; entries: VaultEntry[] }) => {
  const groups = useMemo(() => {
    const m = new Map<string, VaultEntry[]>();
    for (const e of entries) {
      const arr = m.get(e.monthKey) || [];
      arr.push(e); m.set(e.monthKey, arr);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  return (
    <Card className="p-5 shadow-card">
      <h2 className="text-lg font-bold text-primary mb-1 flex items-center gap-2">
        <Archive className="h-4 w-4 text-gold-deep" /> {t("vault_title")}
      </h2>
      <p className="text-xs text-muted-foreground mb-5">{t("vault_subtitle")}</p>
      {entries.length === 0 ? (
        <EmptyState label={t("vault_empty")} />
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
                      <span className="text-muted-foreground hidden sm:inline">— {e.clientName}</span>
                      {e.kind === "shared_doc" && (
                        e.signed ? (
                          <Badge className="bg-success/15 text-success border-success/40 text-[10px]">
                            <FileSignature className="h-3 w-3 me-0.5" /> {t("vault_signed")}
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

/* ============== TRACKING + CHAT HUB VIEWS ============== */

const TrackingView = ({ t, clients, activeId, setActiveId }: {
  t: (k: string) => string; clients: Client[];
  activeId: string; setActiveId: (id: string) => void;
}) => {
  const active = clients.find((c) => c.id === activeId);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-gold-deep" /> {t("acc_tracking_title")}
        </h1>
        <p className="text-xs text-muted-foreground">{t("acc_tracking_subtitle")}</p>
      </div>

      <Card className="p-4 shadow-card">
        <Label className="text-xs">{t("dash_client")}</Label>
        <Select value={activeId} onValueChange={setActiveId}>
          <SelectTrigger><SelectValue placeholder={t("acc_select_client")} /></SelectTrigger>
          <SelectContent>
            {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </Card>

      {active ? (
        <DocChecklist t={t} clientEmail={active.contact} clientName={active.name} accountantMode />
      ) : (
        <Card className="p-8 shadow-card text-center text-sm text-muted-foreground">
          {t("acc_select_client")}
        </Card>
      )}
    </div>
  );
};

const ChatHubView = ({ t }: { t: (k: string) => string }) => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-gold-deep" /> {t("chat_title")}
        </h1>
        <p className="text-xs text-muted-foreground">{t("chat_select_contact")}</p>
      </div>
      <ChatTab role="accountant" />
    </div>
  );
};

/* ============== EDIT G50 PAYLOAD DIALOG ============== */

const EditDeclDialog = ({ doc, onClose, onSave, t }: {
  doc: SharedDoc | null; onClose: () => void;
  onSave: (id: string, payload: string, label: string, workflow: WorkflowStatus) => void;
  t: (k: string) => string;
}) => {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [workflow, setWorkflow] = useState<WorkflowStatus>("draft");
  useEffect(() => {
    if (!doc) return;
    setLabel(doc.label || "");
    setWorkflow(doc.workflow || "draft");
    try { setFields(doc.payload ? JSON.parse(doc.payload) : {}); } catch { setFields({}); }
  }, [doc?.id]);
  if (!doc) return null;

  const numericKeys = ["caHt", "salaries", "benefice", "tap", "tva", "irg", "ibs", "total", "amount"];

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-gold-deep" /> {t("wf_review_edit")} — {doc.type}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          <div>
            <div className="text-xs font-semibold text-primary uppercase mb-2">Payload</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(fields).map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</Label>
                  <Input
                    type={numericKeys.includes(k) ? "number" : "text"}
                    value={String(fields[k] ?? "")}
                    onChange={(e) => setFields((p) => ({ ...p, [k]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t("wf_change")}</Label>
            <WorkflowStepper status={workflow} t={t} onChange={setWorkflow} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={() => {
            onSave(doc.id, JSON.stringify(fields), label, workflow);
            toast.success("Updated");
            onClose();
          }}>{t("sig_apply").includes("Sign") ? "Save" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ============== INTERACTIVE G50 PREVIEW (per client) ============== */

interface ViewG50DialogProps {
  client: Client | null;
  onClose: () => void;
  journal: JournalLine[];
  t: (k: string) => string;
  onFinalize: (decl: Decl, shared: SharedDoc) => void;
}

const ViewG50Dialog = ({ client, onClose, journal, t, onFinalize }: ViewG50DialogProps) => {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<{ caHt?: number; tvaCollected?: number; tvaDeductible?: number; irgSalaries?: number; ibsAcompte?: number }>({});

  const live = useMemo(
    () => client ? computeG50FromJournal(journal, { clientId: client.id, period, tapRate: TAP_RATE }) : null,
    [client, journal, period],
  );

  // Reset overrides when client/period changes
  useEffect(() => { setOverrides({}); setEditing(false); }, [client?.id, period]);

  if (!client || !live) return null;

  const caHt = overrides.caHt ?? live.caHt;
  const tvaCollected = overrides.tvaCollected ?? live.tvaCollected;
  const tvaDeductible = overrides.tvaDeductible ?? live.tvaDeductible;
  const irgSalaries = overrides.irgSalaries ?? live.irgSalaries;
  const ibsAcompte = overrides.ibsAcompte ?? 0;

  const g50 = buildG50Preview({
    period, caHt, tvaCollected, tvaDeductible,
    tapRate: TAP_RATE, irgSalaries, ibsAcompte,
  });

  const finalize = () => {
    const declId = crypto.randomUUID();
    const decl: Decl = {
      id: declId, clientId: client.id, clientName: client.name,
      type: "G50", amount: Math.round(g50.total),
      due: `${period}-20`, status: "filed",
    };
    const shared: SharedDoc = {
      id: crypto.randomUUID(), clientId: client.id, clientName: client.name,
      clientEmail: client.contact, type: "G50",
      label: `G50 ${period} — ${fmtDZD(g50.total)}`,
      date: new Date().toLocaleDateString("fr-DZ"),
      payload: JSON.stringify({
        nif: client.taxId, bp: client.bp, period,
        caHt, tvaCollected, tvaDeductible, irgSalaries, ibsAcompte,
        tap: g50.sections.A.subtotal, tvaDue: g50.tva.tvaDue,
        total: g50.total,
      }),
      workflow: "sent",
    };
    onFinalize(decl, shared);
  };

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        {/* Official-style header */}
        <div className="bg-gradient-to-r from-primary to-primary/90 text-primary-foreground p-5 rounded-t-lg">
          <DialogHeader>
            <div className="text-[11px] opacity-80 uppercase tracking-wider">République Algérienne Démocratique et Populaire</div>
            <div className="text-[11px] opacity-80">Direction Générale des Impôts — DGI</div>
            <DialogTitle className="text-xl font-bold mt-1.5 flex items-center gap-2 text-primary-foreground">
              <Receipt className="h-5 w-5" /> {t("acc_view_g50")} — Série G n° 50
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
            <div>
              <div className="opacity-70">{client.name}</div>
              <div className="font-mono text-[11px] opacity-90">NIF: {client.taxId || "—"} · BP: {client.bp || "—"}</div>
            </div>
            <div className="text-end">
              <Label className="text-[10px] opacity-80">{t("rep_period")}</Label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
                className="h-7 w-44 ms-auto bg-primary-foreground/10 border-primary-foreground/30 text-primary-foreground" />
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="border-gold-deep/40 text-gold-deep bg-gold/5">
              {t("g50_status_draft")}
            </Badge>
            <Button size="sm" variant={editing ? "outline" : "outlineGold"} onClick={() => setEditing((v) => !v)}>
              <Pencil className="h-3.5 w-3.5" /> {editing ? t("acc_done") : t("acc_edit")}
            </Button>
          </div>

          {/* Editable bases */}
          {editing && (
            <Card className="p-4 bg-muted/40 border-dashed">
              <div className="text-xs font-semibold text-primary uppercase mb-2">{t("g50_edit_figures")}</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <EditField label={t("g50_field_ca_ht")} value={caHt} onChange={(v) => setOverrides((p) => ({ ...p, caHt: v }))} />
                <EditField label={t("g50_field_tva_col")} value={tvaCollected} onChange={(v) => setOverrides((p) => ({ ...p, tvaCollected: v }))} />
                <EditField label={t("g50_field_tva_ded")} value={tvaDeductible} onChange={(v) => setOverrides((p) => ({ ...p, tvaDeductible: v }))} />
                <EditField label={t("g50_field_irg_sal")} value={irgSalaries} onChange={(v) => setOverrides((p) => ({ ...p, irgSalaries: v }))} />
                <EditField label={t("g50_field_ibs_acpt")} value={ibsAcompte} onChange={(v) => setOverrides((p) => ({ ...p, ibsAcompte: v }))} />
              </div>
            </Card>
          )}

          {/* Sections A/B/C/D — cells become inputs in edit mode */}
          {(["A","B","C","D"] as const).map((s) => {
            const sec = g50.sections[s];
            if (sec.lines.length === 0) return null;
            const codeToField: Record<string, keyof typeof overrides> = {
              "A-CA": "caHt",
              "B-TVA-COL": "tvaCollected",
              "B-TVA-DED": "tvaDeductible",
              "C-IRG-SAL": "irgSalaries",
              "D-IBS-ACPT": "ibsAcompte",
            };
            return (
              <Card key={s} className="p-0 overflow-hidden border-border/70">
                <div className="bg-muted/40 px-4 py-2 border-b border-border flex items-center justify-between">
                  <div className="font-bold text-primary text-sm">{sec.title}</div>
                  <Badge variant="outline" className="border-gold-deep/40 text-gold-deep bg-gold/5 font-mono text-xs">
                    {fmtDZD(sec.subtotal)}
                  </Badge>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {sec.lines.map((l) => {
                      const field = codeToField[l.code];
                      const cellEditable = editing && !!field;
                      return (
                        <tr key={l.code} className={`border-t border-border/50 ${l.informational ? "text-muted-foreground" : ""}`}>
                          <td className="py-2 px-3 font-mono text-[10px] font-bold text-primary">{l.code}</td>
                          <td className="py-2 px-3 text-xs">{l.label}</td>
                          <td className={`py-2 px-3 text-end font-mono text-xs ${l.informational ? "italic" : "font-bold text-gold-deep"}`}>
                            {cellEditable ? (
                              <Input
                                type="number"
                                value={Number(overrides[field!] ?? l.amount)}
                                onChange={(e) => setOverrides((p) => ({ ...p, [field!]: Number(e.target.value || 0) }))}
                                className="h-7 text-xs font-mono text-end ms-auto w-36 inline-block"
                                title={t("g50_click_to_edit")}
                              />
                            ) : (
                              fmtDZD(l.amount)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            );
          })}

          {/* Total */}
          <div className="rounded-lg bg-gradient-to-r from-gold/15 to-gold/5 border-2 border-gold/40 p-4 flex items-center justify-between">
            <span className="font-bold text-primary uppercase tracking-wide">{t("tax_g50_total")}</span>
            <span className="text-3xl font-bold text-gold-deep font-mono">{fmtDZD(g50.total)}</span>
          </div>
        </div>

        <DialogFooter className="p-5 pt-0">
          <Button variant="ghost" onClick={onClose}>{t("acc_close") || "Fermer"}</Button>
          <Button variant="gold" onClick={finalize}>
            <Send className="h-4 w-4" /> {t("g50_finalize_send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const EditField = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
  <div className="space-y-1">
    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
    <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value || 0))} className="h-8 text-sm font-mono" />
  </div>
);

export default AccountantDashboard;
