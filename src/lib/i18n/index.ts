export type Lang = "en" | "fr" | "ar";
export type Dict = Record<string, string>;

/**
 * Translations are split per language and loaded on demand so only the active
 * language ships in the first load. Add new keys to en.ts, fr.ts and ar.ts
 * (fr/ar are typed against en, so a missing key fails the typecheck).
 */
export const loadTranslations = async (lang: Lang): Promise<Dict> => {
  switch (lang) {
    case "fr": return (await import("./fr")).fr;
    case "ar": return (await import("./ar")).ar;
    default: return (await import("./en")).en;
  }
};

/** localStorage key that remembers the chosen language. */
export const LANG_STORAGE_KEY = "mgmtk_lang";
