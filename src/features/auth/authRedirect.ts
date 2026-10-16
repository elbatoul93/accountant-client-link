import type { Lang } from "@/lib/i18n";

/**
 * Redirect URL for an auth email link. The language rides along as ?lang= so the Supabase
 * email templates (supabase/templates/) can write the email in the language the user had
 * selected when they asked for it. Supabase's redirect allow list uses the ** wildcard,
 * which matches the query string.
 */
export const authRedirectUrl = (path: "/login" | "/reset-password", lang: Lang) =>
  `${window.location.origin}${path}?lang=${lang}`;
