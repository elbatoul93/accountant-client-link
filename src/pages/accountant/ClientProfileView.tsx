import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, AlertCircle, Receipt, ShieldCheck, Trash2, FileDown, Download, FolderOpen, ArrowLeft, Phone, Mail, MapPin, FileCheck2, Pencil, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ClientFilesSection } from "@/components/ClientFilesSection";
import { ClientDocumentsSection } from "@/components/ClientDocumentsSection";
import { generateG50Xlsx, generateG50Pdf } from "@/lib/g50Export";
import { Client, Decl, DeclType, Invoice, LegalDoc, REGIME_DECLS, declLabelKey, fmtDZD, regimeLabelKey } from "@/pages/accountant/shared";
import { EmptyState, InfoCell, KPI } from "@/pages/accountant/ui";
import { UploadLegalDialog } from "@/pages/accountant/ClientDialogs";
import { InvoiceTable } from "@/pages/accountant/OverviewViews";
import { AddDeclarationDialog, DeclList } from "@/pages/accountant/DeclarationDialogs";

export const ClientProfileView = ({
  t, client, userId, decls, invoices, legalDocs, onBack, onAddLegal, onDeleteLegal, onAddDecl, onDeleteDecl, onExtract, onMessage, onEdit, onEditG50,
}: {
  t: (k: string) => string; client: Client; userId: string; decls: Decl[]; invoices: Invoice[]; legalDocs: LegalDoc[];
  onBack: () => void; onAddLegal: (d: LegalDoc) => void; onDeleteLegal: (id: string) => void;
  onAddDecl: (d: Decl) => void; onDeleteDecl: (id: string) => void;
  onExtract: () => void; onMessage: () => void; onEdit: (c: Client) => void;
  onEditG50: (data: { id: string; formData: any }) => void;
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
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("side_back")}
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
              {client.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> <bdi dir="ltr">{client.email}</bdi></span>}
              {client.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> <bdi dir="ltr">{client.phone}</bdi></span>}
              {client.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {client.address}</span>}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" size="sm" onClick={onMessage}>
              <MessageCircle className="h-4 w-4" /> {t("i18n_message")}
            </Button>
            <Button variant="outlineGold" size="sm" onClick={() => onEdit(client)}>
              <Pencil className="h-4 w-4" /> {t("acc_edit")}
            </Button>
            <Button variant="gold" size="sm" onClick={onExtract}>
              <FileDown className="h-4 w-4" /> {t("acc_extract")}
            </Button>
          </div>
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
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:grid sm:grid-cols-5">
          <TabsTrigger value="overview">{t("profile_tab_overview")}</TabsTrigger>
          <TabsTrigger value="files">{t("acc_tab_files")}</TabsTrigger>
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
          <ClientDocumentsSection clientId={client.id} t={t} />
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
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("common_download")}><Download className="h-3.5 w-3.5" /></Button>
                      </a>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onDeleteLegal(d.id)} aria-label={t("common_delete")}>
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

            <DeclList
              items={obligations}
              t={t}
              onDelete={async (declId) => {
                const item = obligations.find((x) => x.id === declId);
                if (!item) return;
                const period = item.due.slice(0, 7);
                const [yyyy, mm] = period.split("-");
                const { data: row, error: lookupErr } = await supabase
                  .from("g50_declarations")
                  .select("id")
                  .eq("client_id", userId)
                  .eq("year", Number(yyyy))
                  .eq("month", Number(mm))
                  .order("generated_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (lookupErr) {
                  toast.error(lookupErr.message || t("i18n_error_generic"));
                  return;
                }
                if (row?.id) {
                  const { error: delErr } = await supabase
                    .from("g50_declarations")
                    .delete()
                    .eq("id", row.id);
                  if (delErr) {
                    toast.error(delErr.message || t("i18n_error_generic"));
                    return;
                  }
                }
                // Remove the obligation entry from the UI immediately.
                onDeleteDecl(declId);
                toast.success(t("acc_deleted"));
              }}
              showType
              onRegenerate={async (d, fmt) => {
                const period = d.due.slice(0, 7);
                const [yyyy, mm] = period.split("-");
                const { data, error } = await supabase
                  .from("g50_declarations")
                  .select("form_data")
                  .eq("client_id", userId)
                  .eq("year", Number(yyyy))
                  .eq("month", Number(mm))
                  .order("generated_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (error || !data?.form_data) {
                  toast.error(t("acc_no_g50_data"));
                  return;
                }
                const payload = data.form_data as any;
                const ext = fmt === "pdf" ? "pdf" : "xlsx";
                const fileName = `G50_${payload.nif || "NIF"}_${yyyy}_${mm}.${ext}`;
                try {
                  if (fmt === "pdf") {
                    const saved = await generateG50Pdf({ ...payload, fileName });
                    if (saved === "xlsx-fallback") toast.warning(t("toast_pdf_unavailable_xlsx"));
                  } else await generateG50Xlsx({ ...payload, fileName });
                } catch (e) {
                  console.error(e);
                  toast.error(fmt === "pdf" ? "Export PDF échoué" : "Export G50 échoué");
                }
              }}
              onEditG50={async (d) => {
                const period = d.due.slice(0, 7);
                const [yyyy, mm] = period.split("-");
                const { data, error } = await supabase
                  .from("g50_declarations")
                  .select("id, form_data")
                  .eq("client_id", userId)
                  .eq("year", Number(yyyy))
                  .eq("month", Number(mm))
                  .order("generated_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (error || !data?.form_data) {
                  toast.error(t("acc_no_g50_data"));
                  return;
                }
                onEditG50({ id: data.id, formData: data.form_data });
              }}
            />
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
