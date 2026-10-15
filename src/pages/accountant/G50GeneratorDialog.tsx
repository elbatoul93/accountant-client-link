import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateG50Xlsx, generateG50Pdf } from "@/lib/g50Export";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { todayIso } from "@/lib/isoDate";
import { g50Amounts, G50_VAT_RATES } from "@/lib/g50Amounts";
import { tapRateForPeriod } from "@/lib/accounting/algerianTax";
import { Client, Decl, SharedDoc, fmtDZD } from "@/pages/accountant/shared";

export const G50GeneratorDialog = ({
  open, onOpenChange, clients, t, onGenerate, getAggregates, getLiveG50, editing,
}: { open: boolean; onOpenChange: (o: boolean) => void; clients: Client[]; t: (k: string) => string;
     editing?: { id: string; formData: any } | null;
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
  const [rTap, setRTap] = useState(String(tapRateForPeriod(new Date().toISOString().slice(0, 7))));
  const [rTva, setRTva] = useState("19");
  const [rIrg, setRIrg] = useState("10");
  const [rIbs, setRIbs] = useState("23");
  const [trimestre, setTrimestre] = useState("");
  const [caHtImposable, setCaHtImposable] = useState("");
  const [synced, setSynced] = useState(false);
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [generating, setGenerating] = useState(false);

  // Prefill from editing row when opened in edit mode
  useEffect(() => {
    if (!open) return;
    if (editing?.formData) {
      const f = editing.formData;
      const cid = f.clientId || clients.find((c) => c.taxId && c.taxId === f.nif)?.id || "";
      if (cid) setClientId(cid);
      if (f.year && f.month) setPeriod(`${f.year}-${String(f.month).padStart(2, "0")}`);
      setCaHt(f.caHt != null ? String(f.caHt) : (f.caHtTotal != null ? String(f.caHtTotal) : ""));
      setSalaries(f.salaries != null ? String(f.salaries) : "");
      setBenefice(f.benefice != null ? String(f.benefice) : "");
      setRTap(f.rTap != null ? String(f.rTap) : String(tapRateForPeriod(f.year && f.month ? `${f.year}-${String(f.month).padStart(2, "0")}` : period)));
      setRTva(f.rTva != null ? String(f.rTva) : "19");
      setRIrg(f.rIrg != null ? String(f.rIrg) : "10");
      setRIbs(f.rIbs != null ? String(f.rIbs) : "23");
      setTrimestre(f.trimestre ? String(f.trimestre) : "");
      setCaHtImposable(f.caHtImposable != null ? String(f.caHtImposable) : "");
      setSynced(false);
    } else {
      // reset on open in create mode
      setClientId(""); setCaHt(""); setSalaries(""); setBenefice("");
      setCaHtImposable(""); setTrimestre("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  // The TAP was repealed from 2024: its rate follows the period, unless a saved G50 is being edited.
  useEffect(() => {
    if (open && !editing) setRTap(String(tapRateForPeriod(period)));
  }, [open, editing, period]);

  // Auto-fill from live journal aggregates when client/period changes
  useEffect(() => {
    if (editing) return; // don't override edit prefill
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
  }, [clientId, period, getLiveG50, getAggregates, editing]);

  // The same arithmetic fills the official form (g50-pdf function and Excel export), so this total is the form's total.
  const bases = {
    caHtTotal: Number(caHt || 0), caHtImposable: Number(caHtImposable || caHt || 0),
    salaries: Number(salaries || 0), benefice: Number(benefice || 0),
    rTap: Number(rTap || 0), rTva: Number(rTva || 0), rIrg: Number(rIrg || 0), rIbs: Number(rIbs || 0),
  };
  const { tap, tva, irg, ibs, total } = g50Amounts(bases);
  const inputsValid =
    [bases.caHtTotal, bases.caHtImposable, bases.salaries, bases.benefice].every((v) => Number.isFinite(v) && v >= 0) &&
    [bases.rTap, bases.rIrg, bases.rIbs].every((v) => Number.isFinite(v) && v >= 0 && v <= 100) &&
    G50_VAT_RATES.includes(bases.rTva);

  const submit = async () => {
    const c = clients.find((x) => x.id === clientId);
    if (!c || !period || total <= 0) { toast.error(t("i18n_required_fields")); return; }
    if (!inputsValid) { toast.error(t("g50_inputs_invalid")); return; }
    const declId = crypto.randomUUID();
    const [yyyy, mm] = period.split("-");
    const ext = format === "pdf" ? "pdf" : "xlsx";
    setGenerating(true);
    try {
      const payload = {
        companyName: c.company || c.name,
        activity: c.activity,
        address: c.address,
        month: mm,
        trimestre: trimestre || undefined,
        year: yyyy,
        direction: c.direction,
        commune: c.commune,
        nif: c.taxId,
        bp: c.bp,
        clientId: c.id,
        caHt: Number(caHt || 0),
        salaries: Number(salaries || 0),
        benefice: Number(benefice || 0),
        rTap: Number(rTap || 0),
        rTva: Number(rTva || 0),
        rIrg: Number(rIrg || 0),
        rIbs: Number(rIbs || 0),
        caHtTotal: bases.caHtTotal,
        caHtImposable: bases.caHtImposable,
        fileName: `G50_${c.taxId || "NIF"}_${yyyy}_${mm}.${ext}`,
      };
      if (format === "pdf") {
        const saved = await generateG50Pdf(payload);
        if (saved === "xlsx-fallback") toast.warning(t("toast_pdf_unavailable_xlsx"));
      } else {
        await generateG50Xlsx(payload);
      }
      // Persist form inputs so this G50 can be regenerated/edited later
      try {
        const { data: auth } = await supabase.auth.getUser();
        const accountantId = auth?.user?.id;
        if (accountantId) {
          if (editing?.id) {
            await supabase.from("g50_declarations")
              .update({
                month: Number(mm),
                year: Number(yyyy),
                form_data: payload as any,
                generated_at: new Date().toISOString(),
              })
              .eq("id", editing.id);
          } else {
            await supabase.from("g50_declarations").insert({
              accountant_id: accountantId,
              client_id: c.id,
              month: Number(mm),
              year: Number(yyyy),
              form_data: payload as any,
            });
          }
        }
      } catch (saveErr) {
        console.error("Failed to save G50 declaration", saveErr);
      }
    } catch (e) {
      console.error(e);
      toast.error(format === "pdf" ? "Export PDF échoué" : "Export G50 échoué");
      setGenerating(false);
      return;
    }
    setGenerating(false);
    const decl: Decl = {
      id: declId, clientId: c.id, clientName: c.name,
      type: "G50", amount: Math.round(total), due: `${period}-20`, status: "filed",
    };
    const shared: SharedDoc = {
      id: crypto.randomUUID(), clientId: c.id, clientName: c.name,
      clientEmail: c.contact, type: "G50",
      label: `G50 ${period} — ${fmtDZD(total)}`,
      date: todayIso(),
      payload: JSON.stringify({ nif: c.taxId, bp: c.bp, caHt, salaries, benefice, rTap, rTva, rIrg, rIbs, tap, tva, irg, ibs, total, period }),
      workflow: "filed",
    };
    const lockOpts = { clientId: c.id, period, reference: declId };
    onGenerate(decl, shared, lockOpts);
    toast.success(t("eng_g50_filed_locked"));
    setClientId(""); setCaHt(""); setSalaries(""); setBenefice(""); setCaHtImposable(""); setTrimestre("");
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("client_nif")}</div>
                  <div className="font-mono text-sm font-semibold">{sel.taxId || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("client_bp")}</div>
                  <div className="font-mono text-sm font-semibold">{sel.bp || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("acc_direction_label")}</div>
                  <div className="text-sm font-semibold">{sel.direction || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("acc_commune_label")}</div>
                  <div className="text-sm font-semibold">{sel.commune || "—"}</div>
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
            <div className="text-xs font-semibold text-primary uppercase">{t("i18n_taxable_bases")}</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">{t("i18n_label_ca_ht")}</Label><Input type="number" value={caHt} onChange={(e) => setCaHt(e.target.value)} placeholder="1000000" /></div>
              <div className="space-y-1.5"><Label className="text-xs">{t("i18n_label_salaries_brut")}</Label><Input type="number" value={salaries} onChange={(e) => setSalaries(e.target.value)} placeholder="200000" /></div>
              <div className="space-y-1.5"><Label className="text-xs">{t("i18n_label_taxable_profit")}</Label><Input type="number" value={benefice} onChange={(e) => setBenefice(e.target.value)} placeholder="150000" /></div>
              <div className="space-y-1.5"><Label className="text-xs">{t("i18n_label_ca_taxable_tva")}</Label><Input type="number" value={caHtImposable} onChange={(e) => setCaHtImposable(e.target.value)} placeholder={t("i18n_ph_taxable_ca")} /></div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-primary uppercase">{t("i18n_g50_identification")}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">{t("i18n_quarter_optional")}</Label><Input type="number" min={1} max={4} value={trimestre} onChange={(e) => setTrimestre(e.target.value)} placeholder="1-4" /></div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-primary uppercase">{t("i18n_rates_auto_calc")}</div>
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
        <DialogFooter className="sm:justify-end">
          <div className="inline-flex rounded-md shadow-sm">
            <Button
              onClick={submit}
              variant="gold"
              disabled={generating}
              className="rounded-e-none"
            >
              {generating
                ? t("tools_g50_generating")
                : format === "pdf"
                  ? t("tools_g50_generate_pdf")
                  : t("tools_g50_generate_excel")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="gold"
                  disabled={generating}
                  className="rounded-s-none border-s border-gold-foreground/20 px-2"
                  aria-label={t("tools_g50_choose_format")}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setFormat("pdf")}>
                  PDF {format === "pdf" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFormat("xlsx")}>
                  Excel {format === "xlsx" && "✓"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogFooter>
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
