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

interface DocRow {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size: number | null;
  created_at: string;
}

const BUCKET = "client-uploads";

export const ClientFilesSection = ({ clientId, clientEmail, clientName, t }: Props) => {
  const [resolvedId, setResolvedId] = useState<string | undefined>(clientId);
  const [files, setFiles] = useState<DocRow[]>([]);
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

  // 2) Fetch document rows for this client from the `documents` table
  const fetchFiles = useCallback(async () => {
    if (!resolvedId) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("documents")
      .select("id,title,description,file_name,file_path,mime_type,size,created_at")
      .eq("user_id", resolvedId)
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      setFiles([]);
    } else {
      setFiles((data || []) as DocRow[]);
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

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          Erreur de chargement: {error}
        </div>
      )}

      {!loading && !error && !resolvedId && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Ce client n'a pas encore de compte lié au portail.
        </div>
      )}

      {!loading && !error && resolvedId && files.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Aucun fichier téléversé pour le moment.
        </div>
      )}

      {!loading && !error && files.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {files.map((f) => (
            <div key={f.id} className="p-3 rounded-lg border border-border/60 flex items-start gap-3 bg-card">
              <div className="p-2 rounded bg-gold/10 text-gold-deep">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{f.title || f.file_name}</div>
                {f.description && (
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{f.description}</div>
                )}
                <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1.5 items-center mt-1">
                  <span className="truncate max-w-[160px]">{f.file_name}</span>
                  {f.mime_type && (
                    <Badge variant="outline" className="text-[10px] font-mono">{f.mime_type}</Badge>
                  )}
                  {typeof f.size === "number" && <span>{(f.size / 1024).toFixed(1)} KB</span>}
                  <span>• {new Date(f.created_at).toLocaleDateString("fr-DZ")}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openFile(f.file_path)}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadFile(f.file_path, f.file_name)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
