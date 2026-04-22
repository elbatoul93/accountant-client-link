import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, AreaChart, Area, CartesianGrid,
} from "recharts";
import { Users, FileText, TrendingUp, AlertCircle, Eye } from "lucide-react";
import { useNavigate, Navigate } from "react-router-dom";

const clients = [
  { name: "Acme SARL", contact: "Sarah B.", revenue: "€12,400", status: "active" },
  { name: "Bennani Trading", contact: "Karim M.", revenue: "€8,900", status: "active" },
  { name: "Atlas Boutique", contact: "Lina R.", revenue: "€5,200", status: "review" },
  { name: "Café Royale", contact: "Hassan T.", revenue: "€3,800", status: "active" },
  { name: "Tech Plus", contact: "Yasmine A.", revenue: "€21,500", status: "active" },
];

const invoices = [
  { id: "INV-2841", client: "Acme SARL", amount: "€2,400", date: "Apr 18", status: "pending" },
  { id: "INV-2840", client: "Tech Plus", amount: "€5,800", date: "Apr 17", status: "processed" },
  { id: "INV-2839", client: "Atlas Boutique", amount: "€940", date: "Apr 16", status: "review" },
  { id: "INV-2838", client: "Café Royale", amount: "€620", date: "Apr 15", status: "processed" },
  { id: "INV-2837", client: "Bennani Trading", amount: "€3,100", date: "Apr 14", status: "pending" },
];

const chartData = [
  { m: "Nov", revenue: 62, expenses: 38 },
  { m: "Dec", revenue: 71, expenses: 41 },
  { m: "Jan", revenue: 58, expenses: 36 },
  { m: "Feb", revenue: 78, expenses: 44 },
  { m: "Mar", revenue: 84, expenses: 47 },
  { m: "Apr", revenue: 92, expenses: 51 },
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
          <KPI icon={TrendingUp} label={t("dash_monthly_revenue")} value="€84.2k" delta="+18%" tone="primary" />
          <KPI icon={AlertCircle} label={t("dash_pending_tax")} value="7" delta="-2" tone="gold" />
        </div>

        {/* Analytics */}
        <Card className="p-5 sm:p-6 shadow-card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-primary">{t("dash_analytics")}</h2>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" />{t("dash_revenue")}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gold" />{t("dash_expenses")}</span>
            </div>
          </div>
          <div className="h-72">
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
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#rev)" />
                <Area type="monotone" dataKey="expenses" stroke="hsl(var(--gold))" strokeWidth={2.5} fill="url(#exp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid lg:grid-cols-5 gap-5">
          {/* Portfolio */}
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
                    <div className="font-bold text-sm text-gold-deep">{c.revenue}</div>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{c.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Invoices */}
          <Card className="p-5 shadow-card lg:col-span-3 overflow-hidden">
            <h2 className="text-lg font-bold text-primary mb-4">{t("dash_recent_invoices")}</h2>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-xs uppercase text-muted-foreground border-b border-border">
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
                      <td className="py-3 font-semibold text-gold-deep">{inv.amount}</td>
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
    <div className="text-2xl sm:text-3xl font-bold mt-3 text-foreground">{value}</div>
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

export default AccountantDashboard;
