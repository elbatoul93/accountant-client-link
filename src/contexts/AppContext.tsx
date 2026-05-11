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
    // Derive role synchronously from JWT metadata to stay consistent with RLS (auth.jwt() ->> 'user_type')
    const meta = (session.user.user_metadata ?? {}) as { user_type?: string; role?: string };
    const role: Role = (meta.user_type ?? meta.role) === "accountant" ? "accountant" : "client";
    // Defer DB calls outside the auth callback to avoid deadlocks
    setTimeout(async () => {
      const uid = session.user.id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("name,email,company")
        .eq("user_id", uid)
        .maybeSingle();
      setUser({
        name: profile?.name || session.user.email?.split("@")[0] || "User",
        email: profile?.email || session.user.email || "",
        role,
        company: profile?.company ?? undefined,
      });
      setLoading(false);
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
