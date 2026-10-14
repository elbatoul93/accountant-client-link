import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MessageCircle, Send } from "lucide-react";
import {
  getChatThread, sendChatMessage, markChatRead, listChatThreads,
  unreadChatCount, onPortalChange, type ChatMessage, type NotifRole,
} from "@/lib/portal";

interface Props {
  t: (k: string) => string;
  role: NotifRole;
  selfName: string;
  /** For client portal: their own email. For accountant: the email of the active conversation. */
  activeClientEmail?: string;
  /** For accountant: list of {email, name} for thread switching. */
  contacts?: { email: string; name: string }[];
}

export const ChatSidebar = ({ t, role, selfName, activeClientEmail, contacts }: Props) => {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<string | undefined>(activeClientEmail);
  useEffect(() => onPortalChange(() => setTick((x) => x + 1)), []);
  useEffect(() => { if (activeClientEmail) setSelected(activeClientEmail); }, [activeClientEmail]);

  const threads = useMemo(() => (role === "accountant" ? listChatThreads() : []), [role, tick]);
  const target = role === "client" ? activeClientEmail : selected;
  const messages = useMemo(() => (target ? getChatThread(target) : []), [target, tick]);
  const unread = unreadChatCount(role, role === "client" ? activeClientEmail : undefined);

  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollerRef.current?.scrollTo({ top: 9e9 }); }, [messages.length, open]);
  useEffect(() => { if (open && target) markChatRead(target, role); }, [open, target, role, tick]);

  const send = () => {
    if (!target || !draft.trim()) return;
    const targetContact = contacts?.find((c) => c.email.toLowerCase() === target.toLowerCase());
    sendChatMessage({
      threadKey: target.toLowerCase(),
      fromRole: role,
      fromName: selfName,
      text: draft.trim(),
    });
    setDraft("");
    // Resolve receiver name for nicer UX (not used directly here but we could push a notification)
    void targetContact;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="gold"
          className="fixed bottom-5 end-5 z-40 shadow-gold rounded-full h-12 w-12 p-0"
          aria-label={t("chat_open")}
        >
          <MessageCircle className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -end-1 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-primary">
            <MessageCircle className="h-4 w-4 text-gold-deep" /> {t("chat_title")}
          </SheetTitle>
        </SheetHeader>

        {role === "accountant" && (
          <div className="border-b max-h-40 overflow-y-auto">
            {threads.length === 0 && !contacts?.length && (
              <p className="p-4 text-xs text-muted-foreground">{t("chat_no_threads")}</p>
            )}
            {(contacts || []).map((c) => {
              const th = threads.find((x) => x.threadKey === c.email.toLowerCase());
              const isActive = selected?.toLowerCase() === c.email.toLowerCase();
              return (
                <button
                  key={c.email}
                  onClick={() => setSelected(c.email)}
                  className={`w-full text-start px-3 py-2 flex items-center justify-between gap-2 text-sm border-b border-border/40 ${
                    isActive ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{c.email}</div>
                  </div>
                  {th?.unreadForAccountant ? (
                    <Badge className="bg-destructive text-destructive-foreground text-[10px] h-5">{th.unreadForAccountant}</Badge>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        <div ref={scrollerRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
          {!target ? (
            <p className="text-xs text-muted-foreground text-center py-10">{t("chat_select_contact")}</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">{t("chat_empty")}</p>
          ) : (
            messages.map((m) => <Bubble key={m.id} m={m} mine={m.fromRole === role} />)
          )}
        </div>

        <div className="p-3 border-t flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={t("chat_placeholder")}
            disabled={!target}
          />
          <Button variant="gold" size="icon" onClick={send} disabled={!target || !draft.trim()} aria-label={t("common_send")}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Bubble = ({ m, mine }: { m: ChatMessage; mine: boolean }) => {
  const { lang } = useApp();
  return (
  <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
      mine ? "bg-primary text-primary-foreground rounded-ee-sm" : "bg-card border rounded-es-sm"
    }`}>
      {!mine && <div className="text-[10px] font-semibold opacity-70 mb-0.5">{m.fromName}</div>}
      <div className="whitespace-pre-wrap break-words">{m.text}</div>
      <div className={`text-[9px] mt-1 ${mine ? "opacity-70" : "text-muted-foreground"}`}>
        {formatDateTime(m.createdAt, lang, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
      </div>
    </div>
  </div>
);
};
