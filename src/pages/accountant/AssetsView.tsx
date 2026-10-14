import { useEffect, useMemo, useState } from "react";
import { useFmtDZD } from "@/lib/useFormat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Building2, Inbox, FileDown, Calculator } from "lucide-react";
import { toast } from "sonner";
import {
  ASSET_RATES, buildAmortizationSchedule, yearlyDotation,
  type FixedAsset, type AssetCategory,
} from "@/lib/accounting/assets";


interface ClientLite { id: string; name: string }

const KEY_ASSETS = "mgmtk_acc_assets";
const load = (): FixedAsset[] => {
  const raw = localStorage.getItem(KEY_ASSETS);
  return raw ? JSON.parse(raw) : [];
};

export const AssetsView = ({ t, clients }: { t: (k: string) => string; clients: ClientLite[] }) => {
  const fmtDZD = useFmtDZD();
  const [assets, setAssets] = useState<FixedAsset[]>(() => load());
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => { localStorage.setItem(KEY_ASSETS, JSON.stringify(assets)); }, [assets]);

  const totalCost = useMemo(() => assets.reduce((s, a) => s + a.cost, 0), [assets]);
  const dotationYear = useMemo(() => yearlyDotation(assets, year), [assets, year]);

  return (
    <Card className="p-5 shadow-card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <Building2 className="h-4 w-4" /> {t("assets_title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("assets_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {t("assets_year")} {year}: {fmtDZD(dotationYear)}
          </Badge>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-8 w-[90px] text-xs" />
          <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {t("assets_add")}
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Stat label={t("assets_count")} value={String(assets.length)} />
        <Stat label={t("assets_total_cost")} value={fmtDZD(totalCost)} />
        <Stat label={`${t("assets_dotation")} ${year}`} value={fmtDZD(dotationYear)} accent />
      </div>

      {assets.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-lg">
          <Inbox className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{t("assets_empty")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                <th className="text-start font-medium py-2.5">{t("assets_label")}</th>
                <th className="text-start font-medium py-2.5 hidden md:table-cell">{t("assets_category")}</th>
                <th className="text-start font-medium py-2.5 hidden lg:table-cell">{t("assets_acquired")}</th>
                <th className="text-end font-medium py-2.5">{t("assets_cost")}</th>
                <th className="text-end font-medium py-2.5">{t("assets_rate")}</th>
                <th className="text-end font-medium py-2.5 hidden sm:table-cell">{t("assets_annuity")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => {
                const meta = ASSET_RATES[a.category];
                const rate = a.rateOverride ?? meta.rate;
                const annuity = a.cost * (rate / 100);
                const isOpen = expanded === a.id;
                return (
                  <>
                    <tr key={a.id} className="border-b border-border/50 hover:bg-muted/40 cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : a.id)}>
                      <td className="py-3">
                        <div className="font-semibold">{a.label}</div>
                        <div className="text-xs text-muted-foreground font-mono">PCN {meta.pcn}</div>
                      </td>
                      <td className="py-3 text-xs hidden md:table-cell">{t(`assets_cat_${a.category}`)}</td>
                      <td className="py-3 text-xs hidden lg:table-cell font-mono">{a.acquiredAt}</td>
                      <td className="py-3 text-end font-mono text-xs">{fmtDZD(a.cost)}</td>
                      <td className="py-3 text-end font-mono text-xs">{rate}%</td>
                      <td className="py-3 text-end font-bold text-gold-deep hidden sm:table-cell">{fmtDZD(annuity)}</td>
                      <td className="py-3 text-end">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs"
                            onClick={(e) => { e.stopPropagation(); setExpanded(isOpen ? null : a.id); }}>
                            <Calculator className="h-3.5 w-3.5" /> {t("assets_schedule")}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); setAssets((p) => p.filter((x) => x.id !== a.id)); }}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-muted/30">
                        <td colSpan={7} className="p-4">
                          <ScheduleTable asset={a} t={t} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddAssetDialog open={open} onOpenChange={setOpen} clients={clients} t={t}
        onAdd={(a) => { setAssets((p) => [a, ...p]); setOpen(false); toast.success(t("assets_added")); }} />
    </Card>
  );
};

const Stat = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className={`p-3 rounded-lg border ${accent ? "border-gold/40 bg-gold/5" : "border-border bg-card"}`}>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`text-lg font-bold font-mono ${accent ? "text-gold-deep" : "text-primary"}`}>{value}</p>
  </div>
);

const ScheduleTable = ({ asset, t }: { asset: FixedAsset; t: (k: string) => string }) => {
  const fmtDZD = useFmtDZD();
  const sch = buildAmortizationSchedule(asset);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-primary uppercase tracking-wider">
          {t("assets_amortization_table")} — {asset.label}
        </h4>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
          const csv = [t("assets_year"), t("assets_annuity"), t("assets_cumulated"), t("assets_vnc")].join(";") + "\n" +
            sch.map((r) => `${r.year};${r.annuity};${r.cumulated};${r.vnc}`).join("\n");
          const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = `amort_${asset.label}.csv`; a.click();
          URL.revokeObjectURL(url);
        }}><FileDown className="h-3 w-3" /> CSV</Button>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/60 text-muted-foreground uppercase">
            <th className="text-start py-1.5">{t("asset_year")}</th>
            <th className="text-end py-1.5">{t("asset_annuity")}</th>
            <th className="text-end py-1.5">{t("asset_cumul_amort")}</th>
            <th className="text-end py-1.5">VNC</th>
          </tr>
        </thead>
        <tbody>
          {sch.map((r) => (
            <tr key={r.year} className="border-b border-border/40 last:border-0">
              <td className="py-1.5 font-mono">{r.year}</td>
              <td className="py-1.5 text-end font-mono">{fmtDZD(r.annuity)}</td>
              <td className="py-1.5 text-end font-mono text-muted-foreground">{fmtDZD(r.cumulated)}</td>
              <td className="py-1.5 text-end font-mono font-semibold text-primary">{fmtDZD(r.vnc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AddAssetDialog = ({ open, onOpenChange, clients, onAdd, t }: {
  open: boolean; onOpenChange: (o: boolean) => void; clients: ClientLite[];
  onAdd: (a: FixedAsset) => void; t: (k: string) => string;
}) => {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<AssetCategory>("computers");
  const [acquired, setAcquired] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState("");
  const [clientId, setClientId] = useState<string>("none");
  const [rateOverride, setRateOverride] = useState("");

  const meta = ASSET_RATES[category];

  const submit = () => {
    if (!label.trim() || !cost) { toast.error(t("assets_validation")); return; }
    onAdd({
      id: crypto.randomUUID(),
      clientId: clientId === "none" ? undefined : clientId,
      label: label.trim(),
      category,
      acquiredAt: acquired,
      cost: Number(cost),
      rateOverride: rateOverride ? Number(rateOverride) : undefined,
    });
    setLabel(""); setCost(""); setRateOverride("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="h-4 w-4 text-gold-deep" /> {t("assets_add")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("assets_label")} *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("ph_asset_example")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("assets_category")} *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as AssetCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ASSET_RATES) as AssetCategory[]).map((k) => (
                  <SelectItem key={k} value={k}>{t(`assets_cat_${k}`)} — {ASSET_RATES[k].rate}% / {ASSET_RATES[k].years} {t("assets_years_unit")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">PCN {meta.pcn} • {t("assets_legal_rate")} {meta.rate}%</p>
          </div>
          {clients.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("payx_client_optional")}</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("ph_cabinet_dash")}</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("assets_acquired")} *</Label>
              <Input type="date" value={acquired} onChange={(e) => setAcquired(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("assets_cost")} *</Label>
              <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="180000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("assets_override_rate")}</Label>
              <Input type="number" value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} placeholder={`${meta.rate}`} />
            </div>
          </div>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{t("acc_save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
