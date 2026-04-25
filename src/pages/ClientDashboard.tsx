import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useApp } from "@/contexts/AppContext";
import { SiteHeader } from "@/components/SiteHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UploadCloud, FileText, CheckCircle2, Clock, FileImage, Inbox, Trash2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

interface Doc { name: string; size: string; date: string; status: "processed" | "pending" }

const STORAGE_KEY = "mgmtk_client_docs";

const ClientDashboard = () => {
  const { t, user } = useApp();
  const [docs, setDocs] = useState<Doc[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  }, [docs]);

  const onDrop = useCallback((files: File[]) => {
    const newDocs: Doc[] = files.map((f) => ({
      name: f.name,
      size: `${(f.size / 1024).toFixed(0)} KB`,
      date: new Date().toLocaleDateString("fr-DZ"),
      status: "pending",
    }));
    setDocs((prev) => [...newDocs, ...prev]);
    toast.success(`${files.length} ${t("toast_uploaded")}`);
  }, [t]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [], "application/pdf": [] },
  });

  if (!user) return <Navigate to="/login" replace />;
  // ROLE GUARD: only clients can see client portal
  if (user.role !== "client") return <Navigate to="/dashboard/accountant" replace />;

  const removeDoc = (i: number) => setDocs((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <SiteHeader />
      <main className="container py-8 space-y-6">
        <div>
          <Badge className="bg-gold/20 text-gold-deep border-gold/40 hover:bg-gold/30 mb-2">{t("dash_cli_title")}</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary">
            {t("dash_cli_welcome")}, {user.name.split(" ")[0]} 👋
          </h1>
          {user.company && <p className="text-muted-foreground mt-1">{user.company}</p>}
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <Card className="p-6 shadow-card">
              <h2 className="text-lg font-bold text-primary mb-1">{t("dash_upload_title")}</h2>
              <p className="text-sm text-muted-foreground mb-5">{t("dash_upload_subtitle")}</p>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-smooth ${
                  isDragActive
                    ? "border-gold bg-gold/5 scale-[1.01]"
                    : "border-primary/30 hover:border-primary hover:bg-primary/5"
                }`}
              >
                <input {...getInputProps()} />
                <div className="inline-flex p-4 rounded-2xl bg-gradient-gold text-gold-foreground mb-4 shadow-gold">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <div className="text-lg font-semibold text-foreground mb-1">
                  {isDragActive ? t("dash_upload_drop") : t("dash_upload_title")}
                </div>
                <div className="text-sm text-muted-foreground mb-4">PDF, JPG, PNG • Max 10MB</div>
                <Button variant="hero" size="sm" type="button">{t("dash_upload_cta")}</Button>
              </div>
            </Card>

            <Card className="p-5 sm:p-6 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-primary">{t("dash_my_docs")}</h2>
                <Badge variant="secondary" className="text-xs">{docs.length}</Badge>
              </div>
              {docs.length === 0 ? (
                <div className="text-center py-10">
                  <div className="inline-flex p-3 rounded-full bg-muted text-muted-foreground mb-3">
                    <Inbox className="h-6 w-6" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t("empty_no_docs")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {docs.map((d, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/40 transition-smooth">
                      <div className="p-2 rounded-md bg-primary/10 text-primary flex-shrink-0">
                        {d.name.toLowerCase().endsWith(".pdf") ? <FileText className="h-4 w-4" /> : <FileImage className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-foreground truncate">{d.name}</div>
                        <div className="text-xs text-muted-foreground">{d.size} • {d.date}</div>
                      </div>
                      {d.status === "processed" ? (
                        <Badge className="bg-success/15 text-success border-success/40 hover:bg-success/20">
                          <CheckCircle2 className="h-3 w-3 me-1" /> {t("dash_status_processed")}
                        </Badge>
                      ) : (
                        <Badge className="bg-warning/15 text-warning-foreground border-warning/40 hover:bg-warning/20">
                          <Clock className="h-3 w-3 me-1" /> {t("dash_status_pending")}
                        </Badge>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeDoc(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="p-5 shadow-card">
              <h2 className="text-base font-bold text-primary mb-2">{t("dash_tax_status")}</h2>
              <p className="text-xs text-muted-foreground mb-4">{t("empty_no_tax")}</p>
              <div className="text-center py-6 border border-dashed border-border rounded-lg">
                <div className="text-xs text-muted-foreground">{t("empty_pending_acc")}</div>
              </div>
            </Card>

            <Card className="p-5 shadow-card">
              <h2 className="text-base font-bold text-primary mb-4">{t("dash_my_accountant")}</h2>
              <div className="text-center py-6 border border-dashed border-border rounded-lg">
                <div className="text-xs text-muted-foreground">{t("empty_no_accountant")}</div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ClientDashboard;
