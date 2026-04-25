import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, FileText, TrendingUp, AlertCircle, Bell, Receipt, ShieldCheck, Plus, Trash2, Inbox, FileDown,
  Wrench, BookOpen, Calculator, Send, Download,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

const fmtDZD = (n: number) =>
  `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(n)} DA`;

interface Client { id: string; name: string; taxId: string; contact: string; status: "active" | "review" }
interface Invoice { id: string; clientId: string; clientName: string; amount: number; date: string; status: "pending" | "processed" | "review" }
interface Decl { id: string; clientId: string; clientName: string; type: "G50" | "CNAS" | "CASNOS" | "CACOBATPH"; amount: number; due: string; status: "upcoming" | "filed" | "overdue" }

interface FinStmt { id: string; clientId: string; clientName: string; year: string; assets: number; liabilities: number; equity: number; revenue: number; netResult: number; createdAt: string }
interface SharedDoc { id: string; clientId: string; clientName: string; clientEmail: string; type: "G50" | "CNAS" | "FS" | "OTHER"; label: string; date: string; payload?: string }

const KEY_CLIENTS = "mgmtk_acc_clients";
const KEY_INVOICES = "mgmtk_acc_invoices";
const KEY_DECLS = "mgmtk_acc_declarations";
const KEY_FS = "mgmtk_acc_fs";
const KEY_SHARED = "mgmtk_acc_shared_docs";

const load = <T,>(k: string): T[] => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : [];
};

const AccountantDashboard = () => {
  const { t, user } = useApp();
  const [clients, setClients] = useState<Client[]>(() => load<Client>(KEY_CLIENTS));
  const [invoices, setInvoices] = useState<Invoice[]>(() => load<Invoice>(KEY_INVOICES));
  const [decls, setDecls] = useState<Decl[]>(() => load<Decl>(KEY_DECLS));
  const [fsList, setFsList] = useState<FinStmt[]>(() => load<FinStmt>(KEY_FS));
  const [sharedDocs, setSharedDocs] = useState<SharedDoc[]>(() => load<SharedDoc>(KEY_SHARED));
  const [obligationsClient, setObligationsClient] = useState<Client | null>(null);
  const [openTool, setOpenTool] = useState<null | "fs" | "g50" | "send">(null);

  useEffect(() => { localStorage.setItem(KEY_CLIENTS, JSON.stringify(clients)); }, [clients]);
  useEffect(() => { localStorage.setItem(KEY_INVOICES, JSON.stringify(invoices)); }, [invoices]);
  useEffect(() => { localStorage.setItem(KEY_DECLS, JSON.stringify(decls)); }, [decls]);
  useEffect(() => { localStorage.setItem(KEY_FS, JSON.stringify(fsList)); }, [fsList]);
  useEffect(() => { localStorage.setItem(KEY_SHARED, JSON.stringify(sharedDocs)); }, [sharedDocs]);

  if (!user) return <Navigate to="/login" replace />;
  // ROLE GUARD: only accountants can see accountant portal
  if (user.role !== "accountant") return <Navigate to="/dashboard/client" replace />;

  const totalRevenue = invoices.reduce((s, i) => s + (i.status === "processed" ? i.amount : 0), 0);
  const pendingInvoices = invoices.filter((i) => i.status === "pending").length;
  const pendingTax = decls.filter((d) => d.status !== "filed").length;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <SiteHeader />
      <main className="container py-8 space-y-6">
        <div>
          <Badge className="bg-gold/20 text-gold-deep border-gold/40 hover:bg-gold/30 mb-2">{t("dash_acc_title")}</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary">
            {t("dash_acc_welcome")}, {user.name.split(" ")[0]}
          </h1>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI icon={Users} label={t("dash_active_clients")} value={String(clients.length)} tone="primary" />
          <KPI icon={FileText} label={t("dash_pending_invoices")} value={String(pendingInvoices)} tone="gold" />
          <KPI icon={TrendingUp} label={t("dash_monthly_revenue")} value={fmtDZD(totalRevenue)} tone="primary" />
          <KPI icon={AlertCircle} label={t("dash_pending_tax")} value={String(pendingTax)} tone="gold" />
        </div>

        {/* Clients */}
        <Card className="p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-primary">{t("dash_portfolio")}</h2>
            <AddClientDialog onAdd={(c) => setClients((p) => [c, ...p])} t={t} />
          </div>
          {clients.length === 0 ? (
            <EmptyState label={t("empty_no_clients")} />
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                    <th className="text-start font-medium py-2.5">{t("dash_client")}</th>
                    <th className="text-start font-medium py-2.5">{t("acc_tax_id")}</th>
                    <th className="text-start font-medium py-2.5 hidden sm:table-cell">{t("acc_contact")}</th>
                    <th className="text-start font-medium py-2.5">{t("dash_status")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                      <td className="py-3 font-medium">{c.name}</td>
                      <td className="py-3 font-mono text-xs text-muted-foreground">{c.taxId}</td>
                      <td className="py-3 text-muted-foreground hidden sm:table-cell">{c.contact}</td>
                      <td className="py-3"><Badge variant="secondary" className="text-[10px] capitalize">{c.status}</Badge></td>
                      <td className="py-3 text-end">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                            onClick={() => setObligationsClient(c)}>
                            <FileDown className="h-3.5 w-3.5" /> {t("acc_extract")}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => {
                              setClients((p) => p.filter((x) => x.id !== c.id));
                              setInvoices((p) => p.filter((x) => x.clientId !== c.id));
                              setDecls((p) => p.filter((x) => x.clientId !== c.id));
                              toast.success("Supprimé");
                            }}>
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

        {/* Invoices */}
        <Card className="p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-primary">{t("dash_recent_invoices")}</h2>
            <AddInvoiceDialog clients={clients} onAdd={(inv) => setInvoices((p) => [inv, ...p])} t={t} />
          </div>
          {invoices.length === 0 ? (
            <EmptyState label={t("empty_no_invoices")} />
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                    <th className="text-start font-medium py-2.5">ID</th>
                    <th className="text-start font-medium py-2.5">{t("dash_client")}</th>
                    <th className="text-start font-medium py-2.5">{t("dash_amount")}</th>
                    <th className="text-start font-medium py-2.5 hidden sm:table-cell">{t("dash_date")}</th>
                    <th className="text-start font-medium py-2.5">{t("dash_status")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                      <td className="py-3 font-mono text-xs text-muted-foreground">{inv.id}</td>
                      <td className="py-3 font-medium">{inv.clientName}</td>
                      <td className="py-3 font-semibold text-gold-deep">{fmtDZD(inv.amount)}</td>
                      <td className="py-3 text-muted-foreground hidden sm:table-cell">{inv.date}</td>
                      <td className="py-3"><Badge variant="outline" className="capitalize text-[10px]">{inv.status}</Badge></td>
                      <td className="py-3 text-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setInvoices((p) => p.filter((x) => x.id !== inv.id))}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* G50 + Social */}
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

        {/* Professional Tools */}
        <Card className="p-5 shadow-card border-gold/30 bg-gradient-to-br from-card to-gold/5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
              <Wrench className="h-4 w-4 text-gold-deep" /> {t("tools_title")}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{t("tools_subtitle")}</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <ToolCard
              icon={BookOpen}
              title={t("tools_fs_title")}
              subtitle={t("tools_fs_subtitle")}
              cta={t("tools_open")}
              onClick={() => setOpenTool("fs")}
              disabled={clients.length === 0}
            />
            <ToolCard
              icon={Calculator}
              title={t("tools_g50_title")}
              subtitle={t("tools_g50_subtitle")}
              cta={t("tools_open")}
              onClick={() => setOpenTool("g50")}
              disabled={clients.length === 0}
            />
            <ToolCard
              icon={FileDown}
              title={t("tools_extract_title")}
              subtitle={t("tools_extract_subtitle")}
              cta={t("acc_extract")}
              onClick={() => clients[0] && setObligationsClient(clients[0])}
              disabled={clients.length === 0}
            />
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

        {/* Notifications placeholder */}
        <Card className="p-5 shadow-card">
          <h2 className="text-lg font-bold text-primary flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4" /> {t("dash_notif_title")}
          </h2>
          <EmptyState label={t("empty_no_notifs")} />
        </Card>

        {/* Tool dialogs */}
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

        {/* Obligations extraction dialog */}
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
      </main>
    </div>
  );
};

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

const AddClientDialog = ({ onAdd, t }: { onAdd: (c: Client) => void; t: (k: string) => string }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [contact, setContact] = useState("");
  const submit = () => {
    if (!name || !taxId) { toast.error("Nom & NIF requis"); return; }
    onAdd({ id: crypto.randomUUID(), name, taxId, contact, status: "active" });
    toast.success("Client ajouté");
    setName(""); setTaxId(""); setContact(""); setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="hero" size="sm"><Plus className="h-4 w-4" /> {t("acc_add_client")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("acc_add_client")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>{t("acc_client_name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme SARL" /></div>
          <div className="space-y-1.5"><Label>{t("acc_tax_id")} (NIF)</Label><Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="000016001234567" /></div>
          <div className="space-y-1.5"><Label>{t("acc_contact")}</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="contact@acme.dz" /></div>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{t("acc_save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

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
  const [clientId, setClientId] = useState("");
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
    setClientId(""); setAmount(""); setDue(""); setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={clients.length === 0}><Plus className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{social ? t("acc_add_social") : t("acc_add_g50")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("dash_client")}</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder={t("acc_select_client")} /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
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

export default AccountantDashboard;
