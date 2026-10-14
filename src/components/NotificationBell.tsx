import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  loadNotifications, markAllNotificationsRead, markNotificationRead, subscribeNotifications,
  type PortalNotificationRow,
} from "@/lib/portalStore";

export const NotificationBell = ({ t }: { t: (k: string) => string }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<PortalNotificationRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setItems(await loadNotifications(30)); } catch { /* the bell stays as it was */ }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || cancelled) return;
      setUserId(data.user.id);
      await refresh();
      if (!cancelled) unsubscribe = subscribeNotifications(data.user.id, refresh);
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [refresh]);

  const unread = items.filter((n) => !n.read).length;

  const open = async (n: PortalNotificationRow) => {
    try { if (!n.read) await markNotificationRead(n.id); } catch { /* ignore */ }
    await refresh();
    if (n.link) navigate(n.link);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("notif_title")}>
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -end-1 h-4 min-w-[16px] px-1 rounded-full bg-gold text-gold-foreground border-0 text-[10px] font-bold leading-none flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
          <div className="text-sm font-semibold text-primary">{t("notif_title")}</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-[11px]"
              onClick={async () => { if (userId) { try { await markAllNotificationsRead(userId); } catch { /* ignore */ } await refresh(); } }}>
              <CheckCheck className="h-3 w-3" /> {t("notif_mark_all")}
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">{t("notif_empty")}</div>
          ) : (
            items.slice(0, 30).map((n) => (
              <button
                key={n.id}
                onClick={() => open(n)}
                className={`w-full text-start px-3 py-2.5 border-b border-border/40 hover:bg-muted/50 transition-smooth ${
                  n.read ? "opacity-60" : "bg-gold/5"
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-gold-deep flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">{n.title}</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-2">{n.message}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(n.createdAt).toLocaleString("fr-DZ")}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
