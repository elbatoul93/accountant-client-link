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

/**
 * localStorage key set when the visitor picks a language in the switcher and cleared once a sign-in has
 * saved that choice on the account. While it is set, sign-in keeps the browser's language instead of
 * applying the one saved on the account.
 */
export const LANG_CHOSEN_KEY = "mgmtk_lang_chosen";

/** A pick that was never handed to an account stops counting after a day (shared browsers). */
const LANG_CHOSEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const markLangChosen = () => {
  try { localStorage.setItem(LANG_CHOSEN_KEY, String(Date.now())); } catch { /* storage unavailable */ }
};
export const isLangChosen = () => {
  try {
    const at = Number(localStorage.getItem(LANG_CHOSEN_KEY));
    return at > 0 && Date.now() - at < LANG_CHOSEN_MAX_AGE_MS;
  } catch { return false; }
};
export const clearLangChosen = () => {
  try { localStorage.removeItem(LANG_CHOSEN_KEY); } catch { /* storage unavailable */ }
};
