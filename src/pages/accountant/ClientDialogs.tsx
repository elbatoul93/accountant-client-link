import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, AlertCircle, ShieldCheck, Plus, Building2, IdCard, Mail, Upload, Pencil, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Client, Invoice, LegalDoc, REGIME_DECLS, TaxRegime } from "@/pages/accountant/shared";
import { Field, Section } from "@/pages/accountant/ui";

export const AddClientDialog = ({
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
  const [direction, setDirection] = useState("");
  const [commune, setCommune] = useState("");

  const reset = () => {
    setName(""); setCompany(""); setLegalForm(""); setActivity("");
    setTaxId(""); setBp(""); setNis(""); setRc("");
    setCnasNo(""); setCasnosNo(""); setHasCacobatph(false);
    setTaxRegime("");
    setEmail(""); setPhone(""); setAddress("");
    setDirection(""); setCommune("");
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
      setDirection(initial.direction || "");
      setCommune(initial.commune || "");
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
      email: mode === "edit" && initial ? initial.email : (email.trim() || undefined),
      phone: phone.trim() || undefined, address: address.trim() || undefined,
      direction: direction.trim() || undefined, commune: commune.trim() || undefined,
      contact: mode === "edit" && initial ? initial.contact : (email.trim() || ""),
      status: initial?.status ?? "active",
    };
    if (mode === "edit" && onUpdate) {
      onUpdate(payload);
      toast.success(t("edit_client_saved"));
    } else {
      onAdd(payload);
      toast.success(t("acc_client_added"));
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
              <Field label={t("acc_client_name") + " *"}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("acc_ph_full_name")} /></Field>
              <Field label={t("client_company")}><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder={t("acc_ph_company")} /></Field>
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
              <Field label={t("client_activity")}><Input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder={t("acc_ph_activity")} /></Field>
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
                <Field label={t("client_bp")}><Input value={bp} onChange={(e) => setBp(e.target.value)} placeholder={t("acc_ph_bp")} className="font-mono" /></Field>
                <Field label={t("acc_direction_label")}><Input value={direction} onChange={(e) => setDirection(e.target.value)} placeholder={t("acc_ph_direction")} /></Field>
                <Field label={t("acc_commune_label")}><Input value={commune} onChange={(e) => setCommune(e.target.value)} placeholder={t("acc_ph_commune")} /></Field>
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
                <Input value={cnasNo} onChange={(e) => setCnasNo(e.target.value)} placeholder={t("acc_ph_cnas_no")} className="font-mono" />
              </Field>
              <Field label={t("client_casnos_no")}>
                <Input value={casnosNo} onChange={(e) => setCasnosNo(e.target.value)} placeholder={t("acc_ph_casnos_no")} className="font-mono" />
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
              {mode !== "edit" && (
                <Field label={t("client_email")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("acc_ph_email_contact")} /></Field>
              )}
              <Field label={t("client_phone")}><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+213 555 12 34 56" /></Field>
              <Field label={t("client_address")} full><Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("acc_ph_address")} rows={2} /></Field>
            </div>
          </Section>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{mode === "edit" ? "Save Changes" : t("acc_save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const LockDialog = ({
  open, onOpenChange, onUnlock, t,
}: { open: boolean; onOpenChange: (o: boolean) => void; onUnlock: () => void; t: (k: string) => string }) => {
  const { user } = useApp();
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { if (!open) { setPw(""); setError(""); } }, [open]);

  const [checking, setChecking] = useState(false);

  // Re-authenticate with the signed-in account's password before allowing edits.
  const verify = async () => {
    if (!user) { setError(t("edit_lock_no_account")); return; }
    if (!pw) { setError(t("edit_lock_wrong")); return; }
    setChecking(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: pw });
      if (authErr) { setError(t("edit_lock_wrong")); return; }
      onUnlock();
    } finally {
      setChecking(false);
    }
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
            <Label htmlFor="edit-lock-password" className="text-xs">{t("edit_lock_password")}</Label>
            <Input
              id="edit-lock-password"
              type="password"
              autoComplete="current-password"
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
          <Button variant="hero" onClick={verify} disabled={!pw || checking}>
            <Lock className="h-3.5 w-3.5" /> {t("edit_lock_unlock")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const UploadLegalDialog = ({ clientId, onAdd, t }: { clientId: string; onAdd: (d: LegalDoc) => void; t: (k: string) => string }) => {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<LegalDoc["kind"]>("RC");
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState("");

  const onFileChange = (f: File | null) => {
    setFile(f);
    if (!f) { setFileData(""); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error(t("i18n_max_5mb")); return; }
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
    toast.success(t("acc_doc_added"));
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
                <SelectItem value="RC">{t("doc_rc_full")}</SelectItem>
                <SelectItem value="NIF">{t("doc_nif_full")}</SelectItem>
                <SelectItem value="NIS">{t("doc_nis_full")}</SelectItem>
                <SelectItem value="STATUTS">{t("doc_statuts")}</SelectItem>
                <SelectItem value="OTHER">{t("tools_doc_other")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("profile_doc_label")}><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("acc_ph_doc_label")} /></Field>
          <Field label={t("i18n_file_pdf_image_5mb")}>
            <Input type="file" accept="application/pdf,image/*" onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
            {file && <p className="text-xs text-muted-foreground mt-1">{file.name} • {(file.size / 1024).toFixed(0)} KB</p>}
          </Field>
        </div>
        <DialogFooter><Button onClick={submit} variant="hero">{t("acc_save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const AddInvoiceDialog = ({ clients, onAdd, t }: { clients: Client[]; onAdd: (i: Invoice) => void; t: (k: string) => string }) => {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [amount, setAmount] = useState("");
  const submit = () => {
    const c = clients.find((x) => x.id === clientId);
    if (!c || !amount) { toast.error(t("acc_client_amount_required")); return; }
    onAdd({
      id: `INV-${Date.now().toString().slice(-5)}`,
      clientId: c.id, clientName: c.name,
      amount: Number(amount),
      date: new Date().toLocaleDateString("fr-DZ"),
      status: "pending",
    });
    toast.success(t("acc_invoice_added"));
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
