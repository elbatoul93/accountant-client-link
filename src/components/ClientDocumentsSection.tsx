import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Loader2, FolderOpen } from "lucide-react";
import { toast } from "sonner";

interface ClientDoc {
  id: string;
  title: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size: number | null;
  created_at: string;
}

const formatSize = (bytes: number | null) => {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
};

const fileTypeLabel = (mime: string | null, name: string) => {
  if (mime) {
    const sub = mime.split("/")[1] || mime;
    return sub.toUpperCase();
  }
  const ext = name.split(".").pop();
  return ext ? ext.toUpperCase() : "FILE";
};

export const ClientDocumentsSection = ({
  clientId,
  t,
}: {
  clientId: string;
  t: (k: string) => string;
}) => {
  const [docs, setDocs] = useState<ClientDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      // Filter only by user_id (already known) — no profiles join, avoids RLS recursion.
      const { data, error } = await supabase
        .from("documents")
        .select("id,title,file_name,file_path,mime_type,size,created_at")
        .eq("user_id", clientId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[ClientDocumentsSection] load", error);
        toast.error(error.message);
      } else {
        setDocs((data ?? []) as ClientDoc[]);
      }
      setLoading(false);
    };
    if (clientId) load();
    return () => { cancelled = true; };
  }, [clientId]);

  const handleDownload = async (doc: ClientDoc) => {
    setDownloading(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from("client-uploads")
        .createSignedUrl(doc.file_path, 60);
      if (error || !data?.signedUrl) {
        toast.error(error?.message || "Failed to generate download link");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card className="p-5 shadow-card">
      <div className="mb-4">
        <h3 className="font-semibold text-primary flex items-center gap-2">
          <FolderOpen className="h-4 w-4" /> {t("nav_group_documents")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("cdoc_subtitle")}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin me-2" /> {t("invite_loading")}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          {t("cdoc_empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div
              key={d.id}
              className="p-3 rounded-lg border border-border/60 flex items-center gap-3 bg-card"
            >
              <div className="p-2 rounded bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">
                  {d.file_name || d.title || "Untitled"}
                </div>
                <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-1.5 mt-0.5">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {fileTypeLabel(d.mime_type, d.file_name)}
                  </Badge>
                  <span>{formatSize(d.size)}</span>
                  <span>•</span>
                  <span>{formatDate(d.created_at)}</span>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => handleDownload(d)}
                disabled={downloading === d.id}
                aria-label="Download"
              >
                {downloading === d.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
