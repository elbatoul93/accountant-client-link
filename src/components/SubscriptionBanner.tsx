import { AlertTriangle, Clock } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useApp } from "@/contexts/AppContext";
import { pluralKey } from "@/lib/format";
import { daysLeft } from "@/lib/billing";
import { CONTACT_EMAIL } from "@/pages/legal/LegalLayout";

export const SubscriptionBanner = ({ t }: { t: (k: string, p?: Record<string, string | number>) => string }) => {
  const sub = useSubscription();
  const { lang } = useApp();
  if (!sub || sub.state === "unrestricted" || sub.state === "active") return null;
  const days = daysLeft(sub.ends_at);
  const readOnly = sub.state === "read_only";
  const shown = Math.max(days ?? 0, 0);
  const key = readOnly
    ? "sub_banner_readonly"
    : pluralKey(sub.state === "grace" ? "sub_banner_grace" : "sub_banner_trial", shown, lang);
  return (
    <div
      role="status"
      className={`mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
        readOnly || sub.state === "grace"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-gold/40 bg-gold/10 text-foreground"
      }`}
    >
      {readOnly || sub.state === "grace" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{t(key, { days: shown, email: CONTACT_EMAIL })}</span>
    </div>
  );
};
