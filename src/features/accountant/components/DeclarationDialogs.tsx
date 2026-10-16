import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, BookOpen, Send, Download, Pencil } from "lucide-react";
import { toast } from "sonner";
import { WorkflowBadge, WorkflowStepper } from "@/components/common/WorkflowStatus";
import { type WorkflowStatus } from "@/lib/portal";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Client, Decl, FinStmt, SharedDoc, fmtDZD } from "@/features/accountant/components/shared";
import { todayIso } from "@/lib/isoDate";
import { EmptyState } from "@/features/accountant/components/ui";
import { printFinStmt } from "@/lib/finStmtPrint";

export const AddDeclarationDialog = ({
  clients, type, onAdd, t, social,
}: { clients: Client[]; type: Decl["type"]; onAdd: (d: Decl) => void; t: (k: string) => string; social?: boolean }) => {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(clients.length === 1 ? clients[0].id : "");
  const [declType, setDeclType] = useState<Decl["type"]>(type);
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const submit = () => {
    const c = clients.find((x) => x.id === clientId);
    if (!c || !amount || !due) { toast.error(t("i18n_required_fields")); return; }
    onAdd({
      id: crypto.randomUUID(),
      clientId: c.id, clientName: c.name,
      type: declType, amount: Number(amount), due, status: "upcoming",
    });
    toast.success(t("acc_decl_added"));
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
              <Label>{t("i18n_organization")}</Label>
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

export const DeclList = ({ items, onDelete, t, showType, onSend, sharedDocs, onReview, onRegenerate, onEditG50, sentMap, sendingId }: {
  items: Decl[]; onDelete: (id: string) => void; t: (k: string) => string;
  showType?: boolean; onSend?: (d: Decl) => void;
  sharedDocs?: SharedDoc[]; onReview?: (s: SharedDoc) => void;
  onRegenerate?: (d: Decl, format: "pdf" | "xlsx") => void | Promise<void>;
  onEditG50?: (d: Decl) => void | Promise<void>;
  sentMap?: Record<string, boolean>;
  sendingId?: string | null;
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  if (items.length === 0) return <EmptyState label={t("empty_no_decls")} />;
  const findShared = (d: Decl): SharedDoc | undefined => {
    if (!sharedDocs) return undefined;
    const period = d.due.slice(0, 7);
    return sharedDocs.find((s) => s.clientId === d.clientId && s.type === d.type && s.label.includes(period))
      || sharedDocs.find((s) => s.clientId === d.clientId && s.type === d.type);
  };
  const handleRegen = async (d: Decl, fmt: "pdf" | "xlsx") => {
    if (!onRegenerate) return;
    setBusyId(d.id + fmt);
    try { await onRegenerate(d, fmt); } finally { setBusyId(null); }
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
            {onRegenerate && d.type === "G50" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outlineGold" disabled={!!busyId && busyId.startsWith(d.id)}>
                    <Download className="h-3.5 w-3.5" />
                    {busyId && busyId.startsWith(d.id) ? t("tools_g50_generating") : t("tools_g50_regenerate")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleRegen(d, "pdf")}>
                    {t("tools_g50_generate_pdf")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRegen(d, "xlsx")}>
                    {t("tools_g50_generate_excel")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {onEditG50 && d.type === "G50" && (
              <Button size="sm" variant="outline" onClick={() => onEditG50(d)} title={t("tools_g50_edit")}>
                <Pencil className="h-3.5 w-3.5" /> {t("tools_g50_edit")}
              </Button>
            )}
            {shared && onReview && (
              <Button size="sm" variant="outline" onClick={() => onReview(shared)} title={t("wf_review_edit")}>
                <Pencil className="h-3.5 w-3.5" /> {t("wf_review_edit")}
              </Button>
            )}
            {onSend && (() => {
              const isSent = !!sentMap?.[d.id];
              const isSending = sendingId === d.id;
              return (
                <Button
                  size="sm"
                  variant="outlineGold"
                  onClick={() => onSend(d)}
                  disabled={isSent || isSending}
                  title={isSent ? (t("g50_sent_label") || "Sent") : t("tools_send_to_client")}
                >
                  <Send className="h-3.5 w-3.5" />
                  {isSent ? (t("g50_sent_label") || "Sent") : isSending ? (t("g50_sending_label") || "Sending…") : null}
                </Button>
              );
            })()}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(d.id)} aria-label={t("common_delete")}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export const FinancialStatementsDialog = ({
  open, onOpenChange, clients, t, onSave, fsList = [], onUpdate, onDelete, dir = "ltr",
}: {
  open: boolean; onOpenChange: (o: boolean) => void; clients: Client[]; t: (k: string) => string; onSave: (fs: FinStmt) => void;
  fsList?: FinStmt[]; onUpdate?: (fs: FinStmt) => void; onDelete?: (id: string) => void; dir?: "ltr" | "rtl";
}) => {
  const [clientId, setClientId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [assets, setAssets] = useState("");
  const [liab, setLiab] = useState("");
  const [equity, setEquity] = useState("");
  const [revenue, setRevenue] = useState("");
  const [net, setNet] = useState("");
  const [editing, setEditing] = useState<FinStmt | null>(null);
  const saved = fsList.filter((x) => x.clientId === clientId).sort((p, q) => q.year.localeCompare(p.year));
  const reset = () => { setEditing(null); setAssets(""); setLiab(""); setEquity(""); setRevenue(""); setNet(""); };
  const startEdit = (x: FinStmt) => {
    setEditing(x); setYear(x.year); setAssets(String(x.assets)); setLiab(String(x.liabilities));
    setEquity(String(x.equity)); setRevenue(String(x.revenue)); setNet(String(x.netResult));
  };
  const submit = () => {
    const c = clients.find((x) => x.id === clientId);
    if (!c || !year || !assets) { toast.error(t("i18n_required_fields")); return; }
    const figures = {
      assets: Number(assets), liabilities: Number(liab || 0), equity: Number(equity || 0),
      revenue: Number(revenue || 0), netResult: Number(net || 0),
    };
    // One statement per client and year: saving a year that already exists updates that row.
    const target = editing ?? fsList.find((x) => x.clientId === c.id && x.year === year);
    if (target && onUpdate) {
      onUpdate({ ...target, clientName: c.name, year, ...figures });
    } else {
      onSave({ id: crypto.randomUUID(), clientId: c.id, clientName: c.name, year, ...figures, createdAt: todayIso() });
    }
    toast.success(t("acc_balance_saved"));
    reset();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); setClientId(""); } onOpenChange(o); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-gold-deep" /> {t("tools_fs_title")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("dash_client")}</Label>
              <Select value={clientId} onValueChange={(v) => { setClientId(v); reset(); }}>
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
        {saved.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground">{t("fs_title")}</div>
            {saved.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2 p-2 rounded border border-border/60 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold">{x.year}</span>
                  <span className="text-muted-foreground"> · {t("tools_assets")} {fmtDZD(x.assets)} · {t("tools_net_result")} {fmtDZD(x.netResult)}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("liasse_print")} title={t("liasse_print")}
                    onClick={() => printFinStmt(x, t, dir, fmtDZD)}><Download className="h-3.5 w-3.5" /></Button>
                  {onUpdate && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("acc_edit")} title={t("acc_edit")}
                    onClick={() => startEdit(x)}><Pencil className="h-3.5 w-3.5" /></Button>}
                  {onDelete && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("common_delete")} title={t("common_delete")}
                    onClick={() => { if (editing?.id === x.id) reset(); onDelete(x.id); }}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>}
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          {editing && <Button variant="outline" onClick={reset}>{t("common_cancel")}</Button>}
          <Button onClick={submit} variant="hero">{t("tools_save_fs")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const SendDocumentDialog = ({
  open, onOpenChange, clients, t, onSend,
}: { open: boolean; onOpenChange: (o: boolean) => void; clients: Client[]; t: (k: string) => string; onSend: (d: SharedDoc) => void | boolean }) => {
  const [clientId, setClientId] = useState("");
  const [type, setType] = useState<SharedDoc["type"]>("G50");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<string>("");

  const onFileChange = (f: File | null) => {
    setFile(f);
    if (!f) { setFileData(""); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error(t("i18n_max_5mb")); return; }
    const reader = new FileReader();
    reader.onload = () => setFileData(reader.result as string);
    reader.readAsDataURL(f);
  };

  const submit = () => {
    const c = clients.find((x) => x.id === clientId);
    if (!c || !label) { toast.error(t("i18n_required_fields")); return; }
    const ok = onSend({
      id: crypto.randomUUID(), clientId: c.id, clientName: c.name,
      clientEmail: c.contact, type, label,
      date: todayIso(),
      fileName: file?.name, mimeType: file?.type, fileData: fileData || undefined,
    });
    if (ok === false) return;
    toast.success(t("acc_doc_shared"));
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
            <Label>{t("i18n_description")}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("acc_ph_send_label")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("i18n_file_pdf_image_5mb")}</Label>
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

export const EditDeclDialog = ({ doc, onClose, onSave, t }: {
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
            <Label className="text-xs">{t("i18n_label")}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          <div>
            <div className="text-xs font-semibold text-primary uppercase mb-2">{t("i18n_payload")}</div>
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
          <Button variant="ghost" onClick={onClose}>{t("i18n_cancel")}</Button>
          <Button variant="gold" onClick={() => {
            onSave(doc.id, JSON.stringify(fields), label, workflow);
            toast.success(t("i18n_updated"));
            onClose();
          }}>{t("sig_apply").includes("Sign") ? "Save" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


