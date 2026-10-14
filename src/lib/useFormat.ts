import { useCallback } from "react";
import { SS_EMPLOYER_RATE } from "@/lib/accounting/payroll";
import { useApp } from "@/contexts/AppContext";
import { formatDZD, formatNumber } from "@/lib/format";

/** Whole-dinar formatter bound to the current app language. */
export const useFmtDZD = () => {
  const { lang } = useApp();
  return useCallback((n: number) => formatDZD(n, lang), [lang]);
};

/** Integer formatter (no currency) bound to the current app language. */
export const useFmtNum = () => {
  const { lang } = useApp();
  return useCallback((n: number) => formatNumber(Math.round(n), lang, { maximumFractionDigits: 0 }), [lang]);
};

/** Employer social-security rate as a localised percentage number, e.g. "25,5". */
export const useEmployerRate = () => {
  const { lang } = useApp();
  return formatNumber(SS_EMPLOYER_RATE * 100, lang);
};
