import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox as InboxIcon, FileText, ExternalLink, Download, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Props { t: (k: string) => string }

interface Row {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size: number | null;
  created_at: string;
  user_id: string;
  client_name: string;
  client_email: string;
}

const BUCKET = "client-uploads";

export const IncomingDocumentsLive = ({ t }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 1) Pull every document the accountant is allowed to read.
    //    RLS on `documents` already restricts rows to clients linked to this
    //    accountant via profiles.linked_accountant_id — no role check here.
    const { data: docs, error: dErr } = await supabase
      .from("documents")
      .select("id,title,description,file_name,file_path,mime_type,size,created_at,user_id")
      .order("created_at", { ascending: false })
      .limit(100);
    if (dErr) {
      setError(dErr.message);
      setLoading(false);
      return;
    }
    if (!docs || docs.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // 2) Resolve client display names through the safe SECURITY DEFINER RPC.
    //    This avoids querying profiles directly and lets database RLS handle access.
    const { data: names, error: namesErr } = await supabase.rpc("get_linked_client_names");
    if (namesErr) {
      setError(namesErr.message);
      setLoading(false);
      return;
    }
    const byId = new Map(
      (names || []).map((client) => [client.id, client.full_name] as const),
    );

    setRows(
      docs.map((d) => ({
        ...d,
        client_name: byId.get(d.user_id) || "—",
        client_email: "",
      })) as Row[],
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const open = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
    if (error || !data?.signedUrl) return toast.error(error?.message || "Impossible d'ouvrir");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  const download = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) return toast.error(error?.message || "Impossible de télécharger");
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-5 shadow-card mb-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          <InboxIcon className="h-4 w-4 text-gold-deep" /> Documents reçus (tous clients)
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
          <Button variant="ghost" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Flux unifié des derniers fichiers téléversés par vos clients.
      </p>

      {loading && (
        <div className="space-y-2">
          {[0,1,2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> Erreur de chargement: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <InboxIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Aucun document n'a encore été téléversé par vos clients.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/40 transition-smooth">
              <div className="p-2 rounded-md bg-primary/10 text-primary flex-shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">
                  {r.title || r.file_name}
                  <span className="text-muted-foreground font-normal"> — Téléversé par </span>
                  <span className="text-primary">{r.client_name}</span>
                </div>
                {r.description && (
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{r.description}</div>
                )}
                <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1.5 items-center mt-1">
                  <span className="truncate max-w-[180px]">{r.file_name}</span>
                  {r.mime_type && <Badge variant="outline" className="text-[10px] font-mono">{r.mime_type}</Badge>}
                  {typeof r.size === "number" && <span>{(r.size / 1024).toFixed(1)} KB</span>}
                  <span>• {new Date(r.created_at).toLocaleString("fr-DZ")}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => open(r.file_path)}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => download(r.file_path, r.file_name)}>
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
