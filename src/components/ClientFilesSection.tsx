import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, ExternalLink, FolderOpen, RefreshCw, Inbox } from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** Auth user_id of the client (preferred). If omitted, will be resolved via clientEmail. */
  clientId?: string;
  /** Email used to resolve clientId via the profiles table. */
  clientEmail?: string;
  clientName?: string;
  t: (k: string) => string;
}

interface StoredFile {
  name: string;
  path: string;          // full path inside bucket: `${userId}/filename`
  size?: number;
  mimetype?: string;
  updated_at?: string;
}

const BUCKET = "client-uploads";

export const ClientFilesSection = ({ clientId, clientEmail, clientName, t }: Props) => {
  const [resolvedId, setResolvedId] = useState<string | undefined>(clientId);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 1) Resolve client user_id from email if it wasn't provided
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (clientId) {
        setResolvedId(clientId);
        return;
      }
      if (!clientEmail) {
        setResolvedId(undefined);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", clientEmail.toLowerCase().trim())
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setResolvedId(data?.user_id);
    };
    resolve();
    return () => { cancelled = true; };
  }, [clientId, clientEmail]);

  // 2) Fetch files for the resolved id
  const fetchFiles = useCallback(async () => {
    if (!resolvedId) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(resolvedId, { limit: 200, sortBy: { column: "updated_at", order: "desc" } });
    if (error) {
      setError(error.message);
      setFiles([]);
    } else {
      setFiles(
        (data || [])
          .filter((f) => f.name && !f.name.endsWith("/"))
          .map((f) => ({
            name: f.name,
            path: `${resolvedId}/${f.name}`,
            size: (f as any).metadata?.size,
            mimetype: (f as any).metadata?.mimetype,
            updated_at: f.updated_at || (f as any).created_at,
          })),
      );
    }
    setLoading(false);
  }, [resolvedId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast.error(error?.message || "Unable to open file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const downloadFile = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) {
      toast.error(error?.message || "Unable to download file");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-primary flex items-center gap-2">
            <FolderOpen className="h-4 w-4" /> Fichiers du client
          </h3>
          <p className="text-xs text-muted-foreground">
            {clientName ? `Documents téléversés par ${clientName}` : "Documents téléversés par le client"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchFiles} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          Erreur de chargement: {error}
        </div>
      )}

      {/* No linked client account */}
      {!loading && !error && !resolvedId && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Ce client n'a pas encore de compte lié au portail.
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && resolvedId && files.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Aucun fichier téléversé pour le moment.
        </div>
      )}

      {/* List */}
      {!loading && !error && files.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {files.map((f) => (
            <div key={f.path} className="p-3 rounded-lg border border-border/60 flex items-center gap-3 bg-card">
              <div className="p-2 rounded bg-gold/10 text-gold-deep">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{f.name}</div>
                <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1.5 items-center">
                  {f.mimetype && (
                    <Badge variant="outline" className="text-[10px] font-mono">{f.mimetype}</Badge>
                  )}
                  {typeof f.size === "number" && <span>{(f.size / 1024).toFixed(1)} KB</span>}
                  {f.updated_at && <span>• {new Date(f.updated_at).toLocaleDateString("fr-DZ")}</span>}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openFile(f.path)}>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadFile(f.path, f.name)}>
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
