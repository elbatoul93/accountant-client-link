import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown } from "lucide-react";
import { PCN, searchPcn, getPcn, type PcnAccount } from "@/lib/accounting/pcn";
import { useApp } from "@/contexts/AppContext";

interface Props {
  value: string;
  onChange: (code: string, acc?: PcnAccount) => void;
  /** Restrict to one or more PCN classes (1..7) */
  classes?: number[];
  placeholder?: string;
  className?: string;
}

/**
 * Searchable Algerian PCN account picker. Supports keyboard typing of
 * any code (validated against the catalog) and a dropdown filter.
 */
export const PcnPicker = ({ value, onChange, classes, placeholder, className }: Props) => {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    let res = searchPcn(q, 80);
    if (classes && classes.length > 0) res = res.filter((a) => classes.includes(a.class));
    return res;
  }, [q, classes]);

  const current = getPcn(value);

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-mono h-9 text-xs"
          >
            <span className="truncate text-start">
              {value ? (
                <>
                  <span className="font-bold text-primary">{value}</span>
                  {current && <span className="ms-2 text-muted-foreground font-sans">{current.label}</span>}
                </>
              ) : (
                <span className="text-muted-foreground font-sans">{placeholder ?? t("pcn_search_ph")}</span>
              )}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] p-0" align="start">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute start-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("pcn_search_ph")}
                className="ps-7 h-8 text-xs"
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5">
              {results.length} / {PCN.length} {t("pcn_accounts_label")}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {results.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">{t("pcn_no_results")}</div>
            ) : (
              results.map((a) => (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => { onChange(a.code, a); setOpen(false); setQ(""); }}
                  className={`w-full text-start px-3 py-2 hover:bg-muted/60 border-b border-border/40 last:border-0 flex items-center gap-2 ${
                    a.code === value ? "bg-primary/10" : ""
                  }`}
                >
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0 border-primary/40 text-primary bg-primary/5">
                    {a.code}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{a.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate" dir="rtl">{a.labelAr}</div>
                  </div>
                  <Badge variant="secondary" className="text-[9px] shrink-0">Cl. {a.class}</Badge>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
