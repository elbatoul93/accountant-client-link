import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  fileName?: string;
  mimeType?: string;
  fileData?: string;
  meta?: Record<string, string | number | undefined>;
  t: (k: string) => string;
}

export const DocPreviewDialog = ({ open, onClose, title, fileName, mimeType, fileData, meta, t }: Props) => {
  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="truncate">{title}</span>
            {mimeType && <Badge variant="outline" className="text-[10px] font-mono">{mimeType}</Badge>}
          </DialogTitle>
        </DialogHeader>

        {meta && Object.keys(meta).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg border border-primary/20 bg-primary/5 text-[11px]">
            {Object.entries(meta).map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <span className="uppercase tracking-wide text-[9px] text-muted-foreground">{k}</span>
                <span className="font-mono font-semibold text-foreground truncate">{String(v ?? "—")}</span>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
          {!fileData ? (
            <div className="text-center text-sm text-muted-foreground py-16">{t("preview_no_file")}</div>
          ) : isImage ? (
            <img src={fileData} alt={fileName || title} className="w-full max-h-[65vh] object-contain bg-card" />
          ) : isPdf ? (
            <iframe src={fileData} title={fileName || title} className="w-full h-[65vh] bg-card" />
          ) : (
            <div className="text-center text-sm text-muted-foreground py-16">
              {t("preview_unsupported")}
            </div>
          )}
        </div>

        {fileData && (
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => window.open(fileData, "_blank")}>
              <ExternalLink className="h-3.5 w-3.5" /> {t("preview_open_new_tab")}
            </Button>
            <Button variant="outlineGold" size="sm" onClick={() => {
              const a = document.createElement("a");
              a.href = fileData; a.download = fileName || "document"; a.click();
            }}>
              <Download className="h-3.5 w-3.5" /> {t("preview_download")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
