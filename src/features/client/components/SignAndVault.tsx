import { useFormat } from "@/hooks/useFormat";
import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, PenTool, Archive, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/features/client/components/SignaturePad";
import { type VaultEntry } from "@/lib/vault";
import { SharedDoc } from "@/features/client/components/shared";

export const SignDialog = ({
  doc, onClose, onSigned, t,
}: { doc: SharedDoc | null; onClose: () => void; onSigned: (id: string, sig: string) => void; t: (k: string) => string }) => {
  const fmt = useFormat();
  const [sig, setSig] = useState<string | null>(null);
  useEffect(() => { setSig(null); }, [doc?.id]);
  if (!doc) return null;
  const alreadySigned = !!doc.signedAt;
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-gold-deep" /> {doc.label}
          </DialogTitle>
        </DialogHeader>

        {/* Document preview */}
        <div className="p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="font-mono text-[10px]">{doc.type}</Badge>
            <span className="text-[11px] text-muted-foreground">{doc.date}</span>
          </div>
          <div className="text-sm font-semibold text-primary">{doc.label}</div>
          {doc.payload && (() => {
            try {
              const p = JSON.parse(doc.payload);
              return (
                <div className="grid grid-cols-2 gap-2 text-[11px] mt-2">
                  {Object.entries(p).slice(0, 8).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2 border-b border-border/40 py-1">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-mono font-semibold text-foreground truncate">{String(v)}</span>
                    </div>
                  ))}
                </div>
              );
            } catch { return null; }
          })()}
        </div>

        {alreadySigned ? (
          <div className="p-4 rounded-lg border-2 border-success/40 bg-success/5 text-center space-y-2">
            <Badge className="bg-success/15 text-success border-success/40">
              <CheckCircle2 className="h-3 w-3 me-1" /> {t("sig_signed_stamp")}
            </Badge>
            {doc.signatureDataUrl && (
              <img src={doc.signatureDataUrl} alt={t("i18n_signature")} className="mx-auto h-20 object-contain" />
            )}
            <div className="text-xs text-muted-foreground">
              {doc.signedBy} • {doc.signedAt && fmt.dateTime(doc.signedAt)}
            </div>
          </div>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold text-primary mb-2">{t("sig_title")}</h3>
              <SignaturePad onChange={setSig} t={t} />
            </div>
            <DialogFooter className="gap-2 flex-wrap">
              <Button
                variant="outlineGold"
                onClick={() => {
                  // Quick "click to sign" — generate a simple text signature
                  const c = document.createElement("canvas");
                  c.width = 520; c.height = 180;
                  const ctx = c.getContext("2d")!;
                  ctx.fillStyle = "#0a3055";
                  ctx.font = "italic 48px 'Brush Script MT', cursive";
                  ctx.fillText("✓ Signed", 30, 100);
                  ctx.font = "14px sans-serif";
                  ctx.fillText(new Date().toLocaleString("fr-DZ"), 30, 140);
                  onSigned(doc.id, c.toDataURL("image/png"));
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("sig_click_to_sign")}
              </Button>
              <Button
                variant="gold"
                onClick={() => {
                  if (!sig) { toast.error(t("sig_required")); return; }
                  onSigned(doc.id, sig);
                }}
              >
                <PenTool className="h-3.5 w-3.5" /> {t("sig_apply")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export const VaultView = ({ entries, t }: { entries: VaultEntry[]; t: (k: string) => string }) => {
  const fmt = useFormat();
  const groups = useMemo(() => {
    const m = new Map<string, VaultEntry[]>();
    for (const e of entries) {
      const arr = m.get(e.monthKey) || [];
      arr.push(e);
      m.set(e.monthKey, arr);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  return (
    <Card className="p-6 shadow-card">
      <h2 className="text-lg font-bold text-primary mb-1 flex items-center gap-2">
        <Archive className="h-4 w-4 text-gold-deep" /> {t("vault_title")}
      </h2>
      <p className="text-xs text-muted-foreground mb-5">{t("vault_subtitle")}</p>

      {entries.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">{t("vault_empty")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([month, items]) => (
            <div key={month}>
              <div className="text-xs uppercase tracking-wide font-bold text-primary mb-2 border-b border-border/60 pb-1">
                {fmt.date(month + "-01", { month: "long", year: "numeric" })}
                <Badge variant="secondary" className="ms-2 text-[10px]">{items.length}</Badge>
              </div>
              <div className="space-y-1.5">
                {items.map((e) => (
                  <div key={e.id} className="flex items-center justify-between p-2.5 rounded border border-border/60 text-xs hover:border-primary/40 transition-smooth">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Badge variant="outline" className="font-mono text-[10px]">{e.type}</Badge>
                      <span className="font-medium truncate">{e.label}</span>
                      {e.kind === "shared_doc" && (
                        e.signed ? (
                          <Badge className="bg-success/15 text-success border-success/40 text-[10px]">
                            <CheckCircle2 className="h-3 w-3 me-0.5" /> {t("vault_signed")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{t("vault_unsigned")}</Badge>
                        )
                      )}
                    </div>
                    <span className="text-muted-foreground text-[11px] ms-2 shrink-0">
                      {fmt.date(e.date)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

