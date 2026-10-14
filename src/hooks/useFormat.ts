import { useApp } from "@/contexts/AppContext";
import { formatDate, formatDateTime } from "@/lib/format";

/** Date helpers bound to the active UI language. */
export const useFormat = () => {
  const { lang } = useApp();
  return {
    lang,
    date: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => formatDate(d, lang, opts),
    dateTime: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => formatDateTime(d, lang, opts),
  };
};
