import type { Lang } from "@/lib/i18n";

// Latin digits in every language (current Algerian practice); only separators and month names change.
const LOCALES: Record<Lang, string> = { en: "en-GB", fr: "fr-DZ", ar: "ar-DZ-u-nu-latn" };

export const localeFor = (lang: Lang): string => LOCALES[lang];

const toDate = (d: Date | string | number) => (d instanceof Date ? d : new Date(d));

export const formatDate = (d: Date | string | number, lang: Lang, opts?: Intl.DateTimeFormatOptions): string =>
  toDate(d).toLocaleDateString(localeFor(lang), opts);

export const formatDateTime = (d: Date | string | number, lang: Lang, opts?: Intl.DateTimeFormatOptions): string =>
  toDate(d).toLocaleString(localeFor(lang), opts);

export const formatNumber = (n: number, lang: Lang, opts?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(localeFor(lang), opts).format(n);

/** Whole dinars, e.g. "1 234 567 DA". */
export const formatDZD = (n: number, lang: Lang): string =>
  `${formatNumber(Math.round(n), lang, { maximumFractionDigits: 0 })} DA`;

/** Replace {name} placeholders (every occurrence) in a translated string. */
export const interpolate = (text: string, params?: Record<string, string | number>): string =>
  params ? text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : text;

const SUPPORTED: Lang[] = ["ar", "fr", "en"];

/** First supported language in the browser's preference list, or null. */
export const detectBrowserLang = (prefs: readonly string[] | undefined): Lang | null => {
  for (const p of prefs ?? []) {
    const base = p.toLowerCase().split("-")[0] as Lang;
    if (SUPPORTED.includes(base)) return base;
  }
  return null;
};
