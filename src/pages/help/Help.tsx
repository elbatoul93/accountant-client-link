import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useApp } from "@/contexts/AppContext";
import { CONTACT_EMAIL } from "@/pages/legal/LegalLayout";
import { ARTICLES, type Audience, type HelpLang } from "./articles";

type Filter = "all" | "accountant" | "client";

const Help = () => {
  const { t, lang } = useApp();
  // Articles exist in French (reference) and Arabic; English visitors read French.
  const hl: HelpLang = lang === "ar" ? "ar" : "fr";
  const [filter, setFilter] = useState<Filter>("all");
  const shown = ARTICLES.filter((a) => filter === "all" || a.audience === filter || a.audience === ("all" satisfies Audience));

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: t("help_filter_all") },
    { key: "accountant", label: t("help_filter_accountant") },
    { key: "client", label: t("help_filter_client") },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <SiteHeader />
      <main className="container max-w-3xl py-10">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("back_home")}
        </Link>
        <h1 className="text-3xl font-bold text-primary">{t("help_title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("help_subtitle")}</p>
        {lang === "en" && (
          <p role="note" className="mt-3 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm">{t("help_fallback_note")}</p>
        )}

        <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label={t("help_filter_label")}>
          {filters.map((f) => (
            <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </Button>
          ))}
        </div>

        <article dir={hl === "ar" ? "rtl" : "ltr"} lang={hl} className="mt-6 rounded-lg border border-border/60 bg-card p-2 sm:p-4">
          <Accordion type="single" collapsible>
            {shown.map((a) => (
              <AccordionItem key={a.id} value={a.id}>
                <AccordionTrigger className="text-start">{a.title[hl]}</AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm leading-relaxed">
                  {a.intro && <p className="text-muted-foreground">{a.intro[hl]}</p>}
                  <ol className="list-decimal space-y-1.5 ps-5">
                    {a.steps[hl].map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </article>

        <p className="mt-6 text-sm text-muted-foreground">
          {t("help_still_stuck")}{" "}
          <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </main>
    </div>
  );
};

export default Help;
