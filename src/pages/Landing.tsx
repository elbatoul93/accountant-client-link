import { Link, useNavigate } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import {
  Upload,
  TrendingUp,
  Languages,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  PlayCircle,
} from "lucide-react";

const Landing = () => {
  const { t, dir, user } = useApp();
  const navigate = useNavigate();

  const features = [
    { icon: Upload, title: t("feat_1_title"), desc: t("feat_1_desc") },
    { icon: TrendingUp, title: t("feat_2_title"), desc: t("feat_2_desc") },
    { icon: Languages, title: t("feat_3_title"), desc: t("feat_3_desc") },
    { icon: ShieldCheck, title: t("feat_4_title"), desc: t("feat_4_desc") },
  ];

  const goStarted = () => {
    if (user) navigate(user.role === "accountant" ? "/dashboard/accountant" : "/dashboard/client");
    else navigate("/signup");
  };

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-hero text-primary-foreground">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 -left-40 h-96 w-96 rounded-full bg-gold blur-3xl" />
          <div className="absolute bottom-0 -right-40 h-96 w-96 rounded-full bg-primary-glow blur-3xl" />
        </div>
        <div className="container relative py-20 md:py-32">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/20 border border-gold/40 text-gold-soft text-xs sm:text-sm font-medium mb-6">
              <Sparkles className="h-3.5 w-3.5" /> {t("hero_badge")}
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[1.1]">
              {t("hero_title").split(" ").slice(0, -2).join(" ")}{" "}
              <span className="text-gradient-gold">{t("hero_title").split(" ").slice(-2).join(" ")}</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-primary-foreground/85 mb-10 max-w-2xl mx-auto leading-relaxed">
              {t("hero_subtitle")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="gold" size="lg" onClick={goStarted} className="h-12 px-8 text-base">
                {t("hero_cta_primary")} <ArrowRight className="rtl:rotate-180" />
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate("/login")}
                className="h-12 px-8 text-base bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                <PlayCircle /> {t("hero_cta_secondary")}
              </Button>
            </div>
          </div>

          {/* Mock dashboard preview */}
          <div className="mt-16 max-w-5xl mx-auto">
            <div className="rounded-2xl bg-background/95 backdrop-blur shadow-elegant p-3 sm:p-4 border border-gold/20">
              <div className="rounded-xl bg-gradient-subtle p-6 sm:p-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                  {[
                    { l: t("dash_active_clients"), v: "0", c: "text-primary" },
                    { l: t("dash_monthly_revenue"), v: "0 DA", c: "text-gold-deep" },
                    { l: t("dash_pending_invoices"), v: "0", c: "text-primary" },
                    { l: t("dash_pending_tax"), v: "0", c: "text-gold-deep" },
                  ].map((s, i) => (
                    <div key={i} className="bg-card rounded-lg p-3 sm:p-4 shadow-card text-start">
                      <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground font-medium">{s.l}</div>
                      <div className={`text-xl sm:text-2xl font-bold mt-1 ${s.c}`}>{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-20 md:py-28 bg-background">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary mb-4">{t("feat_title")}</h2>
            <p className="text-muted-foreground text-base sm:text-lg">{t("feat_subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f, i) => (
              <Card key={i} className="p-6 hover:shadow-elegant transition-smooth group border-border/60 hover:border-gold/40">
                <div className="inline-flex p-3 rounded-xl bg-gradient-gold text-gold-foreground mb-4 group-hover:scale-110 transition-smooth shadow-gold">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-lg text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT / SPLIT */}
      <section id="about" className="py-20 md:py-28 bg-gradient-subtle">
        <div className="container grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary mb-5 leading-tight">
              {t("cta_title")}
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg mb-6">{t("cta_subtitle")}</p>
            <ul className="space-y-3 mb-8">
              {[t("feat_1_desc"), t("feat_2_desc"), t("feat_4_desc")].map((s, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-gold-deep flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{s}</span>
                </li>
              ))}
            </ul>
            <Button variant="hero" size="lg" onClick={goStarted}>
              {t("cta_button")} <ArrowRight className="rtl:rotate-180" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-5 shadow-card hover:shadow-elegant transition-smooth">
              <div className="text-3xl font-bold text-primary">10k+</div>
              <div className="text-xs text-muted-foreground mt-1">{t("landing_businesses")}</div>
            </Card>
            <Card className="p-5 shadow-card mt-6 hover:shadow-elegant transition-smooth">
              <div className="text-3xl font-bold text-gold-deep">99.9%</div>
              <div className="text-xs text-muted-foreground mt-1">{t("landing_uptime")}</div>
            </Card>
            <Card className="p-5 shadow-card hover:shadow-elegant transition-smooth">
              <div className="text-3xl font-bold text-gold-deep">DZD</div>
              <div className="text-xs text-muted-foreground mt-1">{t("landing_local_currency")}</div>
            </Card>
            <Card className="p-5 shadow-card mt-6 hover:shadow-elegant transition-smooth">
              <div className="text-3xl font-bold text-primary">3</div>
              <div className="text-xs text-muted-foreground mt-1">{t("landing_languages_rtl")}</div>
            </Card>
          </div>
        </div>
      </section>

      {/* PRICING / FINAL CTA */}
      <section id="pricing" className="py-20 bg-gradient-hero text-primary-foreground">
        <div className="container text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">{t("landing_ready_bridge")}</h2>
          <p className="text-primary-foreground/80 mb-8">{t("landing_try_portals")}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="gold" size="lg" onClick={() => navigate("/signup")}>{t("nav_get_started")}</Button>
            <Button variant="outline" size="lg" onClick={() => navigate("/login")}
              className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
              {t("nav_login")}
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-background py-8">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div>© 2026 Managementik — {t("brand_tagline")}</div>
          <div className="flex gap-5">
            <Link to="/help" className="hover:text-primary transition-smooth">{t("help_link")}</Link>
            <Link to="/privacy" className="hover:text-primary transition-smooth">{t("landing_privacy")}</Link>
            <Link to="/terms" className="hover:text-primary transition-smooth">{t("landing_terms")}</Link>
            <a href="mailto:contact@managementik.com" className="hover:text-primary transition-smooth">{t("landing_contact")}</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
