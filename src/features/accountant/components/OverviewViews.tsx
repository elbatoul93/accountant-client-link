import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, FileText, TrendingUp, AlertCircle, Plus, Trash2, FileDown, ChevronRight, Search, Pencil, MessageCircle, Link2 } from "lucide-react";
import { FiscalCalendar } from "@/components/common/FiscalCalendar";
import { ClientStatusIcon } from "@/features/accountant/components/ClientStatusIcon";
import { Client, Invoice, fmtDZD } from "@/features/accountant/components/shared";
import { EmptyState, KPI } from "@/features/accountant/components/ui";

export const DashboardView = ({
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
        <Button variant="ghost" size="sm" onClick={onGoClients}>{t("dash_view_all")} <ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
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
        <Button variant="ghost" size="sm" onClick={onOpenCalendar}>{t("fcal_view_all")} <ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
      </div>
    )}
  </>
);

export const ClientsListView = ({
  t, clients, totalCount, search, setSearch, empCountByClient, onOpen, onAdd, onEdit, onDelete, onExtract, onCopyInvite, onMessage,
}: {
  t: (k: string) => string; clients: Client[]; totalCount: number; search: string; setSearch: (v: string) => void;
  empCountByClient: Record<string, number>;
  onOpen: (c: Client) => void; onAdd: () => void; onEdit: (c: Client) => void; onDelete: (id: string) => void; onExtract: (c: Client) => void;
  onCopyInvite: (c: Client) => void;
  onMessage: (c: Client) => void;
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
                        {c.taxRegime === "IFU" ? "IFU" : c.taxRegime === "REEL" ? t("tax_regime_real_short") : t("tax_regime_flat_short")}
                      </Badge>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="py-3 text-muted-foreground hidden lg:table-cell">{c.phone || c.email || c.contact}</td>
                  <td className="py-3"><Badge variant="secondary" className="text-[10px] capitalize">{t(`client_status_${c.status}`) !== `client_status_${c.status}` ? t(`client_status_${c.status}`) : c.status}</Badge></td>
                  <td className="py-3">
                    <ClientStatusIcon t={t} regime={c.taxRegime} employeeCount={empCountByClient[c.id] || 0} hasCacobatph={c.hasCacobatph} />
                  </td>
                  <td className="py-3 text-end" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={() => onCopyInvite(c)} title={t("acc_copy_invite_title")}>
                        <Link2 className="h-3.5 w-3.5" /> {t("acc_copy_invite")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onExtract(c)}>
                        <FileDown className="h-3.5 w-3.5" /> {t("acc_extract")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onMessage(c)} title={t("i18n_message")}>
                        <MessageCircle className="h-3.5 w-3.5" /> {t("i18n_message")}
                      </Button>
                      <Button size="sm" variant="outlineGold" className="h-7 gap-1.5 text-xs" onClick={() => onEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" /> {t("acc_edit")}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => onOpen(c)}>
                        {t("client_open_profile")} <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(c.id)} aria-label={t("common_delete")}>
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

export const InvoiceTable = ({ invoices, t, onDelete, compact }: { invoices: Invoice[]; t: (k: string) => string; onDelete?: (id: string) => void; compact?: boolean }) => (
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
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(inv.id)} aria-label={t("common_delete")}>
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
