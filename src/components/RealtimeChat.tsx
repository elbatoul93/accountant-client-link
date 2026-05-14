import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, MessageCircle, Send, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useApp } from "@/contexts/AppContext";

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
}

interface Contact {
  user_id: string;
  name: string;
  email: string;
  company?: string | null;
}

interface Props {
  /** Logged-in user id */
  selfId: string;
  /** "accountant" → multi-contact pane; "client" → fixed counterpart */
  role: "accountant" | "client";
  /** Optional: preselect a contact (accountant view) */
  preselectId?: string | null;
}

export const RealtimeChat = ({ selfId, role, preselectId }: Props) => {
  const { t } = useApp();
  const isMobile = useIsMobile();
  const [showThreadOnMobile, setShowThreadOnMobile] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Load contacts for this user
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingContacts(true);
      try {
        if (role === "accountant") {
          // Use RPC to bypass profiles RLS recursion
          const { data, error } = await supabase.rpc("get_linked_client_names");
          if (error) throw error;
          if (cancelled) return;
          const list: Contact[] = (data || []).map((row: any) => ({
            user_id: row.id,
            name: (row.full_name && row.full_name.trim()) || "Unknown",
            email: "",
            company: null,
          }));
          setContacts(list);
          if (list.length > 0) {
            const target = preselectId && list.some((c) => c.user_id === preselectId) ? preselectId : list[0].user_id;
            setActiveId((prev) => (prev && list.some((c) => c.user_id === prev) ? prev : target));
          }
        } else {
          // Use the same RPC as the accountant view so chat never reads profiles directly.
          const { data, error } = await supabase.rpc("get_linked_client_names");
          if (error) throw error;
          if (cancelled) return;
          const list: Contact[] = (data || []).map((row: any) => ({
            user_id: row.id,
            name: (row.full_name && row.full_name.trim()) || "Unknown",
            email: "",
            company: null,
          }));
          setContacts(list);
          setActiveId(list[0]?.user_id ?? null);
        }
      } catch (e: any) {
        toast.error(e.message || "Failed to load contacts");
      } finally {
        if (!cancelled) setLoadingContacts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selfId, role]);

  // React to preselect changes after initial load
  useEffect(() => {
    if (role !== "accountant" || !preselectId) return;
    if (contacts.some((c) => c.user_id === preselectId)) {
      setActiveId(preselectId);
      setShowThreadOnMobile(true);
    }
  }, [preselectId, contacts, role]);

  // Load history + subscribe to realtime for active conversation
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${selfId},receiver_id.eq.${activeId}),and(sender_id.eq.${activeId},receiver_id.eq.${selfId})`
        )
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
      } else {
        setMessages((data || []) as Message[]);
        // mark received as read
        const unreadIds = (data || [])
          .filter((m: any) => m.receiver_id === selfId && !m.is_read)
          .map((m: any) => m.id);
        if (unreadIds.length) {
          await supabase.from("messages").update({ is_read: true }).in("id", unreadIds);
        }
      }
      setLoadingMessages(false);
    })();

    const channel = supabase
      .channel(`messages-${selfId}-${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Message;
          const involvesPair =
            (m.sender_id === selfId && m.receiver_id === activeId) ||
            (m.sender_id === activeId && m.receiver_id === selfId);
          if (!involvesPair) return;
          setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
          if (m.receiver_id === selfId && !m.is_read) {
            void supabase.from("messages").update({ is_read: true }).eq("id", m.id);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeId, selfId]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loadingMessages]);

  const activeContact = useMemo(
    () => contacts.find((c) => c.user_id === activeId) || null,
    [contacts, activeId]
  );

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    // Optimistic
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      sender_id: selfId,
      receiver_id: activeId,
      content: text,
      created_at: new Date().toISOString(),
      is_read: false,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: selfId, receiver_id: activeId, content: text })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } else if (data) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? (data as Message) : m))
      );
    }
    setSending(false);
  };

  const initials = (n: string) =>
    n
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

  // ── Single-pane (client) ──
  if (role === "client") {
    return (
      <Card className="flex flex-col h-[70vh] shadow-card overflow-hidden">
        <ChatHeader contact={activeContact} loading={loadingContacts} showAccountantBadge />
        <ChatThread
          ref={scrollerRef}
          loading={loadingMessages}
          messages={messages}
          selfId={selfId}
          empty={!activeContact && !loadingContacts ? "No accountant linked yet." : "No messages yet."}
        />
        <ChatComposer
          draft={draft}
          setDraft={setDraft}
          send={send}
          disabled={!activeContact || sending}
        />
      </Card>
    );
  }

  // ── Two-pane (accountant) — mobile shows one pane at a time ──
  const showSidebar = !isMobile || !showThreadOnMobile;
  const showThread = !isMobile || showThreadOnMobile;

  return (
    <Card className="grid grid-cols-1 md:grid-cols-[260px_1fr] h-[70vh] shadow-card overflow-hidden">
      {showSidebar && (
        <aside className="border-e border-border bg-muted/20 overflow-y-auto">
          <div className="p-3 border-b text-xs font-semibold text-muted-foreground flex items-center gap-2">
            <Users className="h-3.5 w-3.5" /> {t("dash_clients")}
          </div>
          {loadingContacts ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">{t("chat_no_linked_clients")}</p>
          ) : (
            <ul>
              {contacts.map((c) => {
                const active = c.user_id === activeId;
                return (
                  <li key={c.user_id}>
                    <button
                      onClick={() => { setActiveId(c.user_id); setShowThreadOnMobile(true); }}
                      className={`w-full text-start px-3 py-2.5 flex items-center gap-2.5 border-b border-border/40 transition-colors ${
                        active ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                      }`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-[11px]">{initials(c.name || c.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{c.name || c.email}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{c.email}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      )}

      {showThread && (
        <section className="flex flex-col min-w-0">
          <ChatHeader
            contact={activeContact}
            loading={loadingContacts}
            onBack={isMobile ? () => setShowThreadOnMobile(false) : undefined}
            t={t}
          />
          <ChatThread
            ref={scrollerRef}
            loading={loadingMessages}
            messages={messages}
            selfId={selfId}
            empty={!activeContact ? t("chat_select_to_start") : t("chat_no_messages_yet")}
          />
          <ChatComposer
            draft={draft}
            setDraft={setDraft}
            send={send}
            disabled={!activeContact || sending}
            t={t}
          />
        </section>
      )}
    </Card>
  );
};

const ChatHeader = ({
  contact, loading, showAccountantBadge, onBack,
}: {
  contact: Contact | null; loading: boolean; showAccountantBadge?: boolean; onBack?: () => void;
}) => (
  <div className="px-4 py-3 border-b flex items-center gap-3 bg-card">
    {onBack && (
      <Button variant="ghost" size="icon" className="h-8 w-8 -ms-1" onClick={onBack} aria-label="Back">
        <ArrowLeft className="h-4 w-4" />
      </Button>
    )}
    <MessageCircle className="h-4 w-4 text-gold-deep" />
    {loading ? (
      <Skeleton className="h-4 w-32" />
    ) : contact ? (
      <div className="min-w-0 flex items-center gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{contact.name || contact.email}</div>
          {contact.company && (
            <div className="text-[10px] text-muted-foreground truncate">{contact.company}</div>
          )}
        </div>
        {showAccountantBadge && (
          <Badge className="bg-gold/20 text-gold-deep border-gold/40 text-[10px]">Your Accountant</Badge>
        )}
      </div>
    ) : (
      <span className="text-sm text-muted-foreground">No conversation</span>
    )}
  </div>
);

interface ChatThreadProps {
  loading: boolean;
  messages: Message[];
  selfId: string;
  empty: string;
}
const ChatThread = forwardRef<HTMLDivElement, ChatThreadProps>(
  ({ loading, messages, selfId, empty }, ref) => (
    <div ref={ref} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/10">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-10 w-1/2 ms-auto" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">{empty}</p>
      ) : (
        messages.map((m) => <Bubble key={m.id} m={m} mine={m.sender_id === selfId} />)
      )}
    </div>
  )
);
ChatThread.displayName = "ChatThread";

const Bubble = ({ m, mine }: { m: Message; mine: boolean }) => (
  <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
    <div
      className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
        mine
          ? "bg-primary text-primary-foreground rounded-ee-sm"
          : "bg-card border rounded-es-sm"
      }`}
    >
      <div className="whitespace-pre-wrap break-words">{m.content}</div>
      <div className={`text-[9px] mt-1 ${mine ? "opacity-70" : "text-muted-foreground"}`}>
        {new Date(m.created_at).toLocaleString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
        })}
      </div>
    </div>
  </div>
);

const ChatComposer = ({
  draft,
  setDraft,
  send,
  disabled,
}: {
  draft: string;
  setDraft: (s: string) => void;
  send: () => void;
  disabled: boolean;
}) => (
  <div className="p-3 border-t flex items-center gap-2 bg-card">
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      }}
      placeholder="Type a message…"
      disabled={disabled}
    />
    <Button variant="gold" size="icon" onClick={send} disabled={disabled || !draft.trim()}>
      <Send className="h-4 w-4" />
    </Button>
  </div>
);
