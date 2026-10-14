import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { translations, Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type Role = "accountant" | "client";
export interface User {
  name: string;
  email: string;
  role: Role;
  company?: string;
}

interface AppContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  dir: "ltr" | "rtl";
  user: User | null;
  loading: boolean;
  login: (u: User) => void; // legacy no-op shim (kept for compat)
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const LAST_UID_KEY = "mgmtk_last_uid";

const BACKUP_PREFIX = "mgmtkbak_";

/**
 * Per-browser data (mgmtk_*) is not account-scoped and some of it exists nowhere else yet,
 * so never delete it. Move it into a per-account backup on logout / account switch and
 * move it back when that account signs in again.
 */
const stashLocalAppData = (uid: string | null) => {
  if (!uid) return;
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("mgmtk_") && k !== "mgmtk_lang" && k !== LAST_UID_KEY)
      .forEach((k) => {
        const v = localStorage.getItem(k);
        if (v !== null) localStorage.setItem(`${BACKUP_PREFIX}${uid}__${k}`, v);
        localStorage.removeItem(k);
      });
  } catch { /* storage unavailable or full */ }
};

const restoreLocalAppData = (uid: string) => {
  try {
    const prefix = `${BACKUP_PREFIX}${uid}__`;
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => {
        const orig = k.slice(prefix.length);
        if (localStorage.getItem(orig) === null) {
          const v = localStorage.getItem(k);
          if (v !== null) localStorage.setItem(orig, v);
        }
        localStorage.removeItem(k);
      });
  } catch { /* storage unavailable */ }
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("mgmtk_lang");
      if (saved === "ar" || saved === "fr" || saved === "en") return saved;
    } catch { /* storage unavailable */ }
    return "ar";
  });
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try { localStorage.setItem("mgmtk_lang", lang); } catch { /* storage unavailable */ }
  }, [lang, dir]);

  // Hydrate user from a Supabase session
  const hydrate = async (session: Session | null) => {
    if (!session?.user) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const last = localStorage.getItem(LAST_UID_KEY);
      if (last && last !== session.user.id) stashLocalAppData(last);
      restoreLocalAppData(session.user.id);
      localStorage.setItem(LAST_UID_KEY, session.user.id);
    } catch { /* storage unavailable */ }
    // Provisional role from user_metadata (user-editable); replaced by profiles.user_type below
    const meta = (session.user.user_metadata ?? {}) as { user_type?: string; role?: string };
    const role: Role = (meta.user_type ?? meta.role) === "accountant" ? "accountant" : "client";
    const meta2 = (session.user.user_metadata ?? {}) as { name?: string; company?: string };
    // Set the user synchronously from the JWT so route guards never see a
    // signed-in session with a null user (which bounced logins back to /login).
    setUser((prev) => ({
      name: prev?.name || meta2.name?.trim() || session.user.email?.split("@")[0] || "Unknown",
      email: prev?.email || session.user.email || "",
      role,
      company: prev?.company ?? meta2.company ?? undefined,
    }));
    setLoading(false);
    // Defer DB calls outside the auth callback to avoid deadlocks
    setTimeout(async () => {
      const uid = session.user.id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("name,email,company,user_type")
        .eq("user_id", uid)
        .maybeSingle();
      const resolvedName =
        (profile?.name && profile.name.trim()) ||
        (meta2.name && meta2.name.trim()) ||
        "Unknown";
      setUser({
        name: resolvedName,
        email: profile?.email || session.user.email || "",
        // profiles.user_type is the source of truth; user_metadata is user-editable.
        role: profile?.user_type ?? role,
        company: profile?.company ?? meta2.company ?? undefined,
      });
    }, 0);
  };

  useEffect(() => {
    // 1) Set listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      hydrate(session);
    });
    // 2) Then check existing session
    supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const setLang = (l: Lang) => setLangState(l);

  const t = (key: string) => {
    const dict = translations[lang] as Record<string, string>;
    return dict[key] ?? translations.en[key as keyof typeof translations.en] ?? key;
  };

  const login = (_u: User) => {
    // Legacy shim — actual auth is handled by Supabase in AuthForm.
  };

  const logout = async () => {
    let uid: string | null = null;
    try { uid = localStorage.getItem(LAST_UID_KEY); } catch { /* storage unavailable */ }
    await supabase.auth.signOut();
    stashLocalAppData(uid);
    setUser(null);
  };

  return (
    <AppContext.Provider value={{ lang, setLang, t, dir, user, loading, login, logout }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};
