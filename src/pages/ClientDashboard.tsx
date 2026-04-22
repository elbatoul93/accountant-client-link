import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useApp } from "@/contexts/AppContext";
import { SiteHeader } from "@/components/SiteHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, FileText, MessageCircle, CheckCircle2, Clock, AlertTriangle, FileImage } from "lucide-react";
import { useNavigate, Navigate } from "react-router-dom";
import { toast } from "sonner";

interface Doc { name: string; size: string; date: string; status: "processed" | "pending" }

const initialDocs: Doc[] = [
  { name: "Invoice_April_2026.pdf", size: "284 KB", date: "Apr 18", status: "processed" },
  { name: "Receipt_Office_Supplies.jpg", size: "1.2 MB", date: "Apr 15", status: "processed" },
  { name: "Bank_Statement_Q1.pdf", size: "856 KB", date: "Apr 10", status: "pending" },
];

const ClientDashboard = () => {
  const { t, user } = useApp();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Doc[]>(initialDocs);

  const onDrop = useCallback((files: File[]) => {
    const newDocs: Doc[] = files.map((f) => ({
      name: f.name,
      size: `${(f.size / 1024).toFixed(0)} KB`,
      date: "Just now",
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

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <SiteHeader />
      <main className="container py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <Badge className="bg-gold/20 text-gold-deep border-gold/40 hover:bg-gold/30 mb-2">{t("dash_cli_title")}</Badge>
            <h1 className="text-3xl sm:text-4xl font-bold text-primary">
              {t("dash_cli_welcome")}, {user.name.split(" ")[0]} 👋
            </h1>
            {user.company && <p className="text-muted-foreground mt-1">{user.company}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/accountant")}>
            {t("view_as_accountant")}
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          {/* Upload zone — wide */}
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
              <h2 className="text-lg font-bold text-primary mb-4">{t("dash_my_docs")}</h2>
              <div className="space-y-2">
                {docs.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/40 transition-smooth">
                    <div className="p-2 rounded-md bg-primary/10 text-primary flex-shrink-0">
                      {d.name.endsWith(".pdf") ? <FileText className="h-4 w-4" /> : <FileImage className="h-4 w-4" />}
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
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <Card className="p-5 shadow-card">
              <h2 className="text-base font-bold text-primary mb-4">{t("dash_tax_status")}</h2>
              <div className="space-y-4">
                <TaxRow label="VAT — Q1 2026" status="filed" t={t} />
                <TaxRow label="Income Tax 2025" status="in_progress" progress={68} t={t} />
                <TaxRow label="VAT — Q2 2026" status="due" t={t} />
              </div>
              <div className="mt-5 pt-5 border-t border-border/50">
                <div className="text-xs text-muted-foreground">{t("dash_next_deadline")}</div>
                <div className="text-lg font-bold text-gold-deep mt-1">May 15, 2026</div>
              </div>
            </Card>

            <Card className="p-5 shadow-card">
              <h2 className="text-base font-bold text-primary mb-4">{t("dash_my_accountant")}</h2>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center font-bold">
                  SB
                </div>
                <div>
                  <div className="font-semibold text-foreground">Sarah Bennani</div>
                  <div className="text-xs text-muted-foreground">Senior Accountant</div>
                </div>
              </div>
              <Button variant="gold" size="sm" className="w-full">
                <MessageCircle className="h-4 w-4" /> {t("dash_message")}
              </Button>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

const TaxRow = ({ label, status, progress, t }: { label: string; status: "filed" | "in_progress" | "due"; progress?: number; t: (k: string) => string }) => {
  const cfg = {
    filed: { icon: CheckCircle2, color: "text-success", bg: "bg-success/15", label: t("dash_tax_filed") },
    in_progress: { icon: Clock, color: "text-primary", bg: "bg-primary/15", label: t("dash_tax_in_progress") },
    due: { icon: AlertTriangle, color: "text-gold-deep", bg: "bg-gold/15", label: t("dash_tax_due") },
  }[status];
  const Icon = cfg.icon;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
          <Icon className="h-3 w-3" /> {cfg.label}
        </span>
      </div>
      {progress !== undefined && <Progress value={progress} className="h-1.5" />}
    </div>
  );
};

export default ClientDashboard;
