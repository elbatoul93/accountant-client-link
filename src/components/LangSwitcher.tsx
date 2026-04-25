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

const labels: Record<Lang, { flag: string; name: string }> = {
  en: { flag: "🇬🇧", name: "English" },
  fr: { flag: "🇫🇷", name: "Français" },
  ar: { flag: "🇩🇿", name: "العربية" },
};

export const LangSwitcher = () => {
  const { lang, setLang } = useApp();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 font-medium">
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{labels[lang].flag} {labels[lang].name}</span>
          <span className="sm:hidden">{labels[lang].flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover">
        {(Object.keys(labels) as Lang[]).map((l) => (
          <DropdownMenuItem key={l} onClick={() => setLang(l)} className="cursor-pointer gap-2">
            <span>{labels[l].flag}</span>
            <span>{labels[l].name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
