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
  switchRole: (r: Role) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("mgmtk_lang");
    return (saved as Lang) || "ar";
  });
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    localStorage.setItem("mgmtk_lang", lang);
  }, [lang, dir]);

  // Hydrate user from a Supabase session
  const hydrate = async (session: Session | null) => {
    if (!session?.user) {
      setUser(null);
      setLoading(false);
      return;
    }
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
    await supabase.auth.signOut();
    setUser(null);
  };

  const switchRole = (r: Role) => {
    if (!user) return;
    setUser({ ...user, role: r });
  };

  return (
    <AppContext.Provider value={{ lang, setLang, t, dir, user, loading, login, logout, switchRole }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};
