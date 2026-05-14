import { Globe } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Lang } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

// Use flagcdn SVGs — render reliably across all OSes (Windows/Linux lack flag emoji glyphs).
const Flag = ({ code, alt }: { code: string; alt: string }) => (
  <img
    src={`https://flagcdn.com/24x18/${code}.png`}
    srcSet={`https://flagcdn.com/48x36/${code}.png 2x`}
    width={20}
    height={15}
    alt={alt}
    className="inline-block rounded-[2px] shadow-sm"
    loading="lazy"
  />
);

const labels: Record<Lang, { code: string; name: string }> = {
  en: { code: "gb", name: "English" },
  fr: { code: "fr", name: "Français" },
  ar: { code: "dz", name: "العربية" },
};

export const LangSwitcher = () => {
  const { lang, setLang } = useApp();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 font-medium">
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline-flex items-center gap-1.5">
            <Flag code={labels[lang].code} alt={labels[lang].name} />
            {labels[lang].name}
          </span>
          <span className="sm:hidden">
            <Flag code={labels[lang].code} alt={labels[lang].name} />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover">
        {(Object.keys(labels) as Lang[]).map((l) => (
          <DropdownMenuItem key={l} onClick={() => setLang(l)} className="cursor-pointer gap-2">
            <Flag code={labels[l].code} alt={labels[l].name} />
            <span>{labels[l].name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
