import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useApp } from "@/contexts/AppContext";

/**
 * Shared shell for the legal pages. French is the reference text; Arabic is a translation.
 * English visitors read the French text. Everything is pending legal review.
 */
export const LegalLayout = ({ title, children }: { title: string; children: ReactNode }) => {
  const { t, lang } = useApp();
  const ar = lang === "ar";
  return (
    <div className="min-h-screen bg-gradient-subtle">
      <SiteHeader />
      <main className="container max-w-3xl py-10">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("back_home")}
        </Link>
        <div role="note" className="mb-6 rounded-md border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          {ar
            ? "مسودة بانتظار المراجعة القانونية، وهي غير ملزمة بعد. النص الفرنسي هو المرجع."
            : "Brouillon en attente de validation juridique. Draft pending legal review: not yet binding."}
        </div>
        <article dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "fr"} className="space-y-4 rounded-lg border border-border/60 bg-card p-6 sm:p-8 text-sm leading-relaxed [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-primary [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-primary [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:space-y-1">
          <h1>{title}</h1>
          <p className="text-muted-foreground">{ar ? "آخر تحديث: 14 أكتوبر 2026" : "Dernière mise à jour : 14 octobre 2026"}</p>
          {children}
        </article>
      </main>
    </div>
  );
};

export const COMPANY = "Managementik SARL";
export const CONTACT_EMAIL = "contact@managementik.dz";
