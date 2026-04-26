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
  Building2, IdCard, Phone, Mail, MapPin, Upload, FileCheck2,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

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
interface SharedDoc { id: string; clientId: string; clientName: string; clientEmail: string; type: "G50" | "CNAS" | "FS" | "OTHER"; label: string; date: string; payload?: string; fileName?: string; mimeType?: string; fileData?: string }
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

type View = "dashboard" | "clients" | "invoices" | "obligations" | "tools" | "profile";

const AccountantDashboard = () => {
  const { t, user } = useApp();
  const [clients, setClients] = useState<Client[]>(() => load<Client>(KEY_CLIENTS));
  const [invoices, setInvoices] = useState<Invoice[]>(() => load<Invoice>(KEY_INVOICES));
  const [decls, setDecls] = useState<Decl[]>(() => load<Decl>(KEY_DECLS));
  const [fsList, setFsList] = useState<FinStmt[]>(() => load<FinStmt>(KEY_FS));
  const [sharedDocs, setSharedDocs] = useState<SharedDoc[]>(() => load<SharedDoc>(KEY_SHARED));
  const [legalDocs, setLegalDocs] = useState<LegalDoc[]>(() => load<LegalDoc>(KEY_LEGAL));
  const [obligationsClient, setObligationsClient] = useState<Client | null>(null);
  const [openTool, setOpenTool] = useState<null | "fs" | "g50" | "send">(null);
  const [view, setView] = useState<View>("dashboard");
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openAdd, setOpenAdd] = useState(false);

  useEffect(() => { localStorage.setItem(KEY_CLIENTS, JSON.stringify(clients)); }, [clients]);
  useEffect(() => { localStorage.setItem(KEY_INVOICES, JSON.stringify(invoices)); }, [invoices]);
  useEffect(() => { localStorage.setItem(KEY_DECLS, JSON.stringify(decls)); }, [decls]);
  useEffect(() => { localStorage.setItem(KEY_FS, JSON.stringify(fsList)); }, [fsList]);
  useEffect(() => { localStorage.setItem(KEY_SHARED, JSON.stringify(sharedDocs)); }, [sharedDocs]);
  useEffect(() => { localStorage.setItem(KEY_LEGAL, JSON.stringify(legalDocs)); }, [legalDocs]);

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

  const activeClient = activeClientId ? clients.find((c) => c.id === activeClientId) || null : null;

  const openProfile = (c: Client) => {
    setActiveClientId(c.id);
    setView("profile");
  };

  const sidebarItems: { key: View; label: string; icon: any; count?: number }[] = [
    { key: "dashboard", label: t("side_dashboard"), icon: LayoutDashboard },
    { key: "clients", label: t("side_clients"), icon: Users, count: clients.length },
    { key: "invoices", label: t("side_invoices"), icon: FileText, count: invoices.length },
    { key: "obligations", label: t("side_obligations"), icon: Receipt, count: decls.length },
    { key: "tools", label: t("side_tools"), icon: Wrench },
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
              <nav className="space-y-1">
                {sidebarItems.map((it) => {
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
                      {typeof it.count === "number" && (
                        <Badge variant="secondary" className={`text-[10px] ${active ? "bg-primary-foreground/20 text-primary-foreground border-0" : ""}`}>
                          {it.count}
                        </Badge>
                      )}
                    </button>
                  );
                })}
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
              />
            )}

            {view === "clients" && (
              <ClientsListView
                t={t} clients={filteredClients} totalCount={clients.length}
                search={search} setSearch={setSearch}
                onOpen={openProfile}
                onAdd={() => setOpenAdd(true)}
                onDelete={(id) => {
                  setClients((p) => p.filter((x) => x.id !== id));
                  setInvoices((p) => p.filter((x) => x.clientId !== id));
                  setDecls((p) => p.filter((x) => x.clientId !== id));
                  setLegalDocs((p) => p.filter((x) => x.clientId !== id));
                  toast.success("Supprimé");
                }}
                onExtract={setObligationsClient}
              />
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
                    onDelete={(id) => setDecls((p) => p.filter((x) => x.id !== id))} />
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
          </main>
        </div>
      </div>

      {/* Global dialogs */}
      <AddClientDialog open={openAdd} onOpenChange={setOpenAdd}
        onAdd={(c) => { setClients((p) => [c, ...p]); setOpenAdd(false); }} t={t} />

      <FinancialStatementsDialog
        open={openTool === "fs"} onOpenChange={(o) => !o && setOpenTool(null)}
        clients={clients} t={t}
        onSave={(fs) => { setFsList((p) => [fs, ...p]); setOpenTool(null); }}
      />
      <G50GeneratorDialog
        open={openTool === "g50"} onOpenChange={(o) => !o && setOpenTool(null)}
        clients={clients} t={t}
        onGenerate={(d, shared) => {
          setDecls((p) => [d, ...p]);
          if (shared) setSharedDocs((p) => [shared, ...p]);
          setOpenTool(null);
        }}
      />
      <SendDocumentDialog
        open={openTool === "send"} onOpenChange={(o) => !o && setOpenTool(null)}
        clients={clients} t={t}
        onSend={(doc) => { setSharedDocs((p) => [doc, ...p]); setOpenTool(null); }}
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
    </div>
  );
};

/* ============== VIEWS ============== */

const DashboardView = ({
  t, user, clients, invoices, decls, totalRevenue, pendingInvoices, pendingTax, onGoClients, onAddClient,
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

    <Card className="p-5 shadow-card">
      <h2 className="text-lg font-bold text-primary flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4" /> {t("dash_notif_title")}
      </h2>
      <EmptyState label={t("empty_no_notifs")} />
    </Card>
  </>
);

const ClientsListView = ({
  t, clients, totalCount, search, setSearch, onOpen, onAdd, onDelete, onExtract,
}: {
  t: (k: string) => string; clients: Client[]; totalCount: number; search: string; setSearch: (v: string) => void;
  onOpen: (c: Client) => void; onAdd: () => void; onDelete: (id: string) => void; onExtract: (c: Client) => void;
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
                <th className="text-start font-medium py-2.5 hidden lg:table-cell">{t("client_phone")}</th>
                <th className="text-start font-medium py-2.5">{t("dash_status")}</th>
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
                  <td className="py-3 text-muted-foreground hidden lg:table-cell">{c.phone || c.email || c.contact}</td>
                  <td className="py-3"><Badge variant="secondary" className="text-[10px] capitalize">{c.status}</Badge></td>
                  <td className="py-3 text-end" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onExtract(c)}>
                        <FileDown className="h-3.5 w-3.5" /> {t("acc_extract")}
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
  const g50 = decls.filter((d) => d.type === "G50");
  const social = decls.filter((d) => d.type !== "G50");

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
            <h1 className="text-2xl font-bold text-primary">{client.name}</h1>
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
          <InfoCell label="BP" value={client.bp} />
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
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="overview">{t("profile_tab_overview")}</TabsTrigger>
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
            <DeclList items={g50} t={t} onDelete={() => {}} />
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
  open, onOpenChange, onAdd, t,
}: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (c: Client) => void; t: (k: string) => string }) => {
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

  const submit = () => {
    if (!name.trim() || !taxId.trim() || !legalForm || !taxRegime) {
      toast.error([t("acc_client_name"), t("client_nif"), t("client_legal_form"), t("client_tax_regime")].join(" • "));
      return;
    }
    onAdd({
      id: crypto.randomUUID(),
      name: name.trim(), company: company.trim() || undefined,
      legalForm: legalForm.trim() || undefined, activity: activity.trim() || undefined,
      taxId: taxId.trim(), bp: bp.trim() || undefined, nis: nis.trim() || undefined, rc: rc.trim() || undefined,
      cnasNo: cnasNo.trim() || undefined, casnosNo: casnosNo.trim() || undefined, hasCacobatph,
      taxRegime: taxRegime as TaxRegime,
      email: email.trim() || undefined, phone: phone.trim() || undefined, address: address.trim() || undefined,
      contact: email.trim(), // for client portal email matching
      status: "active",
    });
    toast.success("Client ajouté");
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-gold-deep" /> {t("acc_new_client")}
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
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                NIF & BP — Carte d'Immatriculation Fiscale
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

const DeclList = ({ items, onDelete, t, showType }: { items: Decl[]; onDelete: (id: string) => void; t: (k: string) => string; showType?: boolean }) => {
  if (items.length === 0) return <EmptyState label={t("empty_no_decls")} />;
  return (
    <div className="space-y-2">
      {items.map((d) => (
        <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/60">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{d.clientName}</div>
            <div className="text-[11px] text-muted-foreground">
              {showType && <Badge variant="outline" className="text-[10px] me-1.5 font-mono">{d.type}</Badge>}
              {t("dash_deadline")}: {d.due}
            </div>
          </div>
          <div className="text-end">
            <div className="font-bold text-sm text-gold-deep">{fmtDZD(d.amount)}</div>
            <Badge variant="outline" className="text-[10px]">{t(`dash_${d.status}`)}</Badge>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(d.id)}>
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      ))}
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
  open, onOpenChange, clients, t, onGenerate,
}: { open: boolean; onOpenChange: (o: boolean) => void; clients: Client[]; t: (k: string) => string; onGenerate: (d: Decl, shared: SharedDoc | null) => void }) => {
  const [clientId, setClientId] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [caHt, setCaHt] = useState("");
  const [salaries, setSalaries] = useState("");
  const [benefice, setBenefice] = useState("");
  const [rTap, setRTap] = useState("2");
  const [rTva, setRTva] = useState("19");
  const [rIrg, setRIrg] = useState("10");
  const [rIbs, setRIbs] = useState("23");

  const tap = (Number(caHt || 0) * Number(rTap || 0)) / 100;
  const tva = (Number(caHt || 0) * Number(rTva || 0)) / 100;
  const irg = (Number(salaries || 0) * Number(rIrg || 0)) / 100;
  const ibs = (Number(benefice || 0) * Number(rIbs || 0)) / 100;
  const total = tap + tva + irg + ibs;

  const submit = () => {
    const c = clients.find((x) => x.id === clientId);
    if (!c || !period || total <= 0) { toast.error("Champs requis"); return; }
    const decl: Decl = {
      id: crypto.randomUUID(), clientId: c.id, clientName: c.name,
      type: "G50", amount: Math.round(total), due: `${period}-20`, status: "upcoming",
    };
    const shared: SharedDoc = {
      id: crypto.randomUUID(), clientId: c.id, clientName: c.name,
      clientEmail: c.contact, type: "G50",
      label: `G50 ${period} — ${fmtDZD(total)}`,
      date: new Date().toLocaleDateString("fr-DZ"),
      payload: JSON.stringify({ nif: c.taxId, bp: c.bp, caHt, salaries, benefice, rTap, rTva, rIrg, rIbs, tap, tva, irg, ibs, total, period }),
    };
    onGenerate(decl, shared);
    toast.success("G50 généré et envoyé au client");
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

export default AccountantDashboard;
