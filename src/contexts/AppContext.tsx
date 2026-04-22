import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { translations, Lang } from "@/lib/i18n";

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
  login: (u: User) => void;
  logout: () => void;
  switchRole: (r: Role) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("mgmtk_lang");
    return (saved as Lang) || "en";
  });
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("mgmtk_user");
    return saved ? JSON.parse(saved) : null;
  });

  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    localStorage.setItem("mgmtk_lang", lang);
  }, [lang, dir]);

  const setLang = (l: Lang) => setLangState(l);

  const t = (key: string) => {
    const dict = translations[lang] as Record<string, string>;
    return dict[key] ?? translations.en[key as keyof typeof translations.en] ?? key;
  };

  const login = (u: User) => {
    setUser(u);
    localStorage.setItem("mgmtk_user", JSON.stringify(u));
  };
  const logout = () => {
    setUser(null);
    localStorage.removeItem("mgmtk_user");
  };
  const switchRole = (r: Role) => {
    if (!user) return;
    const next = { ...user, role: r };
    setUser(next);
    localStorage.setItem("mgmtk_user", JSON.stringify(next));
  };

  return (
    <AppContext.Provider value={{ lang, setLang, t, dir, user, login, logout, switchRole }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};
