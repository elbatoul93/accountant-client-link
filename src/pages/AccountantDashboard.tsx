import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SiteHeader } from "@/components/SiteHeader";
import {
  ResponsiveContainer, XAxis, YAxis, Tooltip, AreaChart, Area, CartesianGrid, BarChart, Bar, Legend,
} from "recharts";
import {
  Users, FileText, TrendingUp, AlertCircle, Eye, Bell, Calendar, Send, ShieldCheck, Receipt, BellRing, Clock,
} from "lucide-react";
import { useNavigate, Navigate } from "react-router-dom";
import { toast } from "sonner";

const fmtDZD = (n: number) =>
  `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(n)} DA`;

const clients = [
  { name: "Acme SARL", contact: "Sarah B.", revenue: 1_240_000, status: "active" },
  { name: "Bennani Trading", contact: "Karim M.", revenue: 890_000, status: "active" },
  { name: "Atlas Boutique", contact: "Lina R.", revenue: 520_000, status: "review" },
  { name: "Café Royale", contact: "Hassan T.", revenue: 380_000, status: "active" },
  { name: "Tech Plus", contact: "Yasmine A.", revenue: 2_150_000, status: "active" },
];

const invoices = [
  { id: "INV-2841", client: "Acme SARL", amount: 240_000, date: "18 Avr", status: "pending" },
  { id: "INV-2840", client: "Tech Plus", amount: 580_000, date: "17 Avr", status: "processed" },
  { id: "INV-2839", client: "Atlas Boutique", amount: 94_000, date: "16 Avr", status: "review" },
  { id: "INV-2838", client: "Café Royale", amount: 62_000, date: "15 Avr", status: "processed" },
  { id: "INV-2837", client: "Bennani Trading", amount: 310_000, date: "14 Avr", status: "pending" },
];

const chartData = [
  { m: "Nov", revenue: 6_200_000, expenses: 3_800_000 },
  { m: "Déc", revenue: 7_100_000, expenses: 4_100_000 },
  { m: "Jan", revenue: 5_800_000, expenses: 3_600_000 },
  { m: "Fév", revenue: 7_800_000, expenses: 4_400_000 },
  { m: "Mar", revenue: 8_400_000, expenses: 4_700_000 },
  { m: "Avr", revenue: 9_200_000, expenses: 5_100_000 },
];

const g50Items = [
  { client: "Acme SARL", period: "Avril 2026", amount: 184_500, progress: 85, due: "20 Mai", status: "ready" },
  { client: "Tech Plus", period: "Avril 2026", amount: 412_000, progress: 60, due: "20 Mai", status: "in_progress" },
  { client: "Bennani Trading", period: "Avril 2026", amount: 96_300, progress: 30, due: "20 Mai", status: "in_progress" },
  { client: "Atlas Boutique", period: "Avril 2026", amount: 47_200, progress: 100, due: "20 Mai", status: "filed" },
];

const socialDecls = [
  { client: "Acme SARL", body: "CNAS", amount: 87_400, due: "30 Avr", status: "upcoming" },
  { client: "Tech Plus", body: "CASNOS", amount: 32_000, due: "25 Avr", status: "overdue" },
  { client: "Café Royale", body: "CACOBATPH", amount: 18_500, due: "15 Mai", status: "upcoming" },
  { client: "Bennani Trading", body: "CNAS", amount: 64_200, due: "12 Avr", status: "paid" },
  { client: "Atlas Boutique", body: "CASNOS", amount: 24_800, due: "30 Avr", status: "upcoming" },
];

const notifications = [
  { icon: BellRing, text: "Reminder sent to Acme SARL for RC renewal", time: "2h ago", tone: "primary" },
  { icon: AlertCircle, text: "G50 deadline in 2 days — 3 clients pending", time: "4h ago", tone: "gold" },
  { icon: ShieldCheck, text: "CNAS payment confirmed for Bennani Trading", time: "Yesterday", tone: "success" },
  { icon: Calendar, text: "CASNOS overdue: Tech Plus (3 days)", time: "Yesterday", tone: "destructive" },
  { icon: Receipt, text: "12 new invoices uploaded by Atlas Boutique", time: "2 days ago", tone: "primary" },
  { icon: Clock, text: "TVA Q1 declaration approved by DGI", time: "3 days ago", tone: "success" },
];

const finSummary = [
  { m: "Jan", tax: 920_000, social: 410_000 },
  { m: "Fév", tax: 1_080_000, social: 460_000 },
  { m: "Mar", tax: 1_240_000, social: 510_000 },
  { m: "Avr", tax: 1_390_000, social: 540_000 },
  { m: "Mai", tax: 1_510_000, social: 580_000 },
  { m: "Juin", tax: 1_680_000, social: 620_000 },
];

const AccountantDashboard = () => {
  const { t, user } = useApp();
  const navigate = useNavigate();
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <SiteHeader />
      <main className="container py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <Badge className="bg-gold/20 text-gold-deep border-gold/40 hover:bg-gold/30 mb-2">{t("dash_acc_title")}</Badge>
            <h1 className="text-3xl sm:text-4xl font-bold text-primary">
              {t("dash_acc_welcome")}, {user.name.split(" ")[0]}
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/client")}>
            {t("view_as_client")}
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI icon={Users} label={t("dash_active_clients")} value="248" delta="+12%" tone="primary" />
          <KPI icon={FileText} label={t("dash_pending_invoices")} value="32" delta="+5" tone="gold" />
          <KPI icon={TrendingUp} label={t("dash_monthly_revenue")} value={fmtDZD(8_420_000)} delta="+18%" tone="primary" />
          <KPI icon={AlertCircle} label={t("dash_pending_tax")} value="7" delta="-2" tone="gold" />
        </div>

        {/* Analytics + Notifications */}
        <div className="grid lg:grid-cols-3 gap-5">
          <Card className="p-5 sm:p-6 shadow-card lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-primary">{t("dash_analytics")}</h2>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" />{t("dash_revenue")}</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gold" />{t("dash_expenses")}</span>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                  <Tooltip
                    formatter={(v: number) => fmtDZD(v)}
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#rev)" />
                  <Area type="monotone" dataKey="expenses" stroke="hsl(var(--gold))" strokeWidth={2.5} fill="url(#exp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Smart Notifications */}
          <Card className="p-5 shadow-card flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                <Bell className="h-4 w-4" /> {t("dash_notif_title")}
              </h2>
              <Badge className="bg-destructive/15 text-destructive border-destructive/40 hover:bg-destructive/20">6</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{t("dash_notif_subtitle")}</p>
            <div className="space-y-2.5 flex-1 overflow-y-auto max-h-72 -mx-1 px-1">
              {notifications.map((n, i) => {
                const toneMap: Record<string, string> = {
                  primary: "bg-primary/10 text-primary",
                  gold: "bg-gold/15 text-gold-deep",
                  success: "bg-success/15 text-success",
                  destructive: "bg-destructive/15 text-destructive",
                };
                return (
                  <div key={i} className="flex gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-smooth">
                    <div className={`h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 ${toneMap[n.tone]}`}>
                      <n.icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground leading-snug">{n.text}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{n.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* G50 + Social Declarations */}
        <div className="grid lg:grid-cols-2 gap-5">
          {/* G50 */}
          <Card className="p-5 shadow-card">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> {t("dash_g50_title")}
                </h2>
                <p className="text-xs text-muted-foreground">{t("dash_g50_subtitle")}</p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs">{t("dash_view_all")}</Button>
            </div>
            <div className="space-y-3.5 mt-4">
              {g50Items.map((g, i) => (
                <div key={i} className="p-3 rounded-lg border border-border/60 hover:border-primary/40 transition-smooth">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-foreground truncate">{g.client}</div>
                      <div className="text-[11px] text-muted-foreground">{g.period} · {t("dash_deadline")}: {g.due}</div>
                    </div>
                    <div className="text-end">
                      <div className="font-bold text-sm text-gold-deep">{fmtDZD(g.amount)}</div>
                      <G50Status status={g.status} />
                    </div>
                  </div>
                  <Progress value={g.progress} className="h-1.5" />
                </div>
              ))}
            </div>
          </Card>

          {/* Social */}
          <Card className="p-5 shadow-card overflow-hidden">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> {t("dash_social_title")}
                </h2>
                <p className="text-xs text-muted-foreground">{t("dash_social_subtitle")}</p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs">{t("dash_view_all")}</Button>
            </div>
            <div className="overflow-x-auto -mx-5 px-5 mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                    <th className="text-start font-medium py-2.5">{t("dash_client")}</th>
                    <th className="text-start font-medium py-2.5">Org.</th>
                    <th className="text-start font-medium py-2.5">{t("dash_amount")}</th>
                    <th className="text-start font-medium py-2.5 hidden sm:table-cell">{t("dash_deadline")}</th>
                    <th className="text-start font-medium py-2.5">{t("dash_compliance")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {socialDecls.map((s, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-smooth">
                      <td className="py-3 font-medium text-xs">{s.client}</td>
                      <td className="py-3"><Badge variant="outline" className="text-[10px] font-mono">{s.body}</Badge></td>
                      <td className="py-3 font-semibold text-gold-deep text-xs">{fmtDZD(s.amount)}</td>
                      <td className="py-3 text-muted-foreground text-xs hidden sm:table-cell">{s.due}</td>
                      <td className="py-3"><SocialStatus status={s.status} t={t} /></td>
                      <td className="py-3 text-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => toast.success(`Reminder sent to ${s.client}`)}
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Financial Summary chart */}
        <Card className="p-5 sm:p-6 shadow-card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-primary">{t("dash_fin_summary")}</h2>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />{t("dash_tax_estimate")}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gold" />{t("dash_social_contrib")}</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={finSummary}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip
                  formatter={(v: number) => fmtDZD(v)}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Bar dataKey="tax" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="social" fill="hsl(var(--gold))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Portfolio + Invoices */}
        <div className="grid lg:grid-cols-5 gap-5">
          <Card className="p-5 shadow-card lg:col-span-2">
            <h2 className="text-lg font-bold text-primary mb-4">{t("dash_portfolio")}</h2>
            <div className="space-y-2.5">
              {clients.map((c, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-smooth">
                  <div className="h-9 w-9 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center font-semibold text-sm flex-shrink-0">
                    {c.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-foreground truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.contact}</div>
                  </div>
                  <div className="text-end">
                    <div className="font-bold text-sm text-gold-deep">{fmtDZD(c.revenue)}</div>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{c.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 shadow-card lg:col-span-3 overflow-hidden">
            <h2 className="text-lg font-bold text-primary mb-4">{t("dash_recent_invoices")}</h2>
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
                  {invoices.map((inv, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-smooth">
                      <td className="py-3 font-mono text-xs text-muted-foreground">{inv.id}</td>
                      <td className="py-3 font-medium">{inv.client}</td>
                      <td className="py-3 font-semibold text-gold-deep">{fmtDZD(inv.amount)}</td>
                      <td className="py-3 text-muted-foreground hidden sm:table-cell">{inv.date}</td>
                      <td className="py-3"><StatusBadge status={inv.status} /></td>
                      <td className="py-3">
                        <Button size="icon" variant="ghost" className="h-7 w-7"><Eye className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

const KPI = ({ icon: Icon, label, value, delta, tone }: { icon: any; label: string; value: string; delta: string; tone: "primary" | "gold" }) => (
  <Card className="p-4 sm:p-5 shadow-card hover:shadow-elegant transition-smooth">
    <div className="flex items-start justify-between">
      <div className={`p-2 rounded-lg ${tone === "primary" ? "bg-primary/10 text-primary" : "bg-gold/15 text-gold-deep"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <span className={`text-xs font-semibold ${delta.startsWith("-") ? "text-destructive" : "text-success"}`}>{delta}</span>
    </div>
    <div className="text-xl sm:text-2xl font-bold mt-3 text-foreground truncate">{value}</div>
    <div className="text-xs text-muted-foreground mt-1">{label}</div>
  </Card>
);

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    pending: "bg-warning/15 text-warning-foreground border-warning/40",
    processed: "bg-success/15 text-success border-success/40",
    review: "bg-gold/15 text-gold-deep border-gold/40",
  };
  return <Badge variant="outline" className={`capitalize text-[10px] ${map[status] || ""}`}>{status}</Badge>;
};

const G50Status = ({ status }: { status: string }) => {
  const map: Record<string, { cls: string; label: string }> = {
    ready: { cls: "bg-success/15 text-success border-success/40", label: "Ready" },
    in_progress: { cls: "bg-primary/10 text-primary border-primary/30", label: "In progress" },
    filed: { cls: "bg-gold/15 text-gold-deep border-gold/40", label: "Filed" },
  };
  const c = map[status];
  return <Badge variant="outline" className={`text-[10px] mt-0.5 ${c.cls}`}>{c.label}</Badge>;
};

const SocialStatus = ({ status, t }: { status: string; t: (k: string) => string }) => {
  const map: Record<string, string> = {
    overdue: "bg-destructive/15 text-destructive border-destructive/40",
    upcoming: "bg-warning/15 text-warning-foreground border-warning/40",
    paid: "bg-success/15 text-success border-success/40",
  };
  const labelMap: Record<string, string> = {
    overdue: t("dash_overdue"),
    upcoming: t("dash_upcoming"),
    paid: t("dash_paid"),
  };
  return <Badge variant="outline" className={`text-[10px] ${map[status]}`}>{labelMap[status]}</Badge>;
};

export default AccountantDashboard;
