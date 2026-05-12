import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, MessageCircle, Sparkles, ImageIcon, Eye, Trash2, BellOff, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications, getSoundEnabled, setSoundEnabled, type Notification, type NotificationType } from "@/hooks/use-notifications";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

type Actor = { id: string; display_name: string; photo_url: string | null };

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const TYPE_ICON: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  message: MessageCircle,
  match: Heart,
  post_like: Heart,
  comment: MessageCircle,
  story_view: Eye,
};
const TYPE_TINT: Record<NotificationType, string> = {
  message: "bg-sky-500",
  match: "bg-gradient-to-br from-pink-500 to-primary",
  post_like: "bg-rose-500",
  comment: "bg-violet-500",
  story_view: "bg-amber-500",
};

function targetForNotification(n: Notification): { to: string; params?: Record<string, string> } {
  if (n.type === "message" && n.match_id) return { to: "/chat/$matchId", params: { matchId: n.match_id } };
  if (n.type === "match" && n.match_id) return { to: "/chat/$matchId", params: { matchId: n.match_id } };
  if (n.type === "post_like" || n.type === "comment") return { to: "/feed" };
  if (n.type === "story_view") return { to: "/feed" };
  return { to: "/feed" };
}

function NotificationsPage() {
  const { items, unread, loading, markAllRead, markRead, remove } = useNotifications();
  const [actors, setActors] = useState<Map<string, Actor>>(new Map());
  const [soundOn, setSoundOnState] = useState<boolean>(true);

  useEffect(() => { setSoundOnState(getSoundEnabled()); }, []);

  useEffect(() => {
    const ids = Array.from(new Set(items.map((n) => n.actor_id).filter(Boolean) as string[]));
    if (ids.length === 0) return;
    const missing = ids.filter((id) => !actors.has(id));
    if (missing.length === 0) return;
    supabase.from("profiles").select("id, display_name, photo_url").in("id", missing).then(({ data }) => {
      if (!data) return;
      setActors((prev) => {
        const next = new Map(prev);
        for (const a of data) next.set(a.id, a as Actor);
        return next;
      });
    });
  }, [items, actors]);

  return (
    <div className="flex-1 mx-auto w-full max-w-2xl px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Notifications {unread > 0 && <span className="ml-1 text-sm font-medium text-muted-foreground">({unread})</span>}</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { const v = !soundOn; setSoundEnabled(v); setSoundOnState(v); }}
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label={soundOn ? "Mute notification sound" : "Unmute notification sound"}
            title={soundOn ? "Sound on" : "Sound off"}
          >
            {soundOn ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </button>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs font-semibold text-primary px-2 py-1.5">
              Mark all read
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">You're all caught up.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
          {items.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Sparkles;
            const tint = TYPE_TINT[n.type];
            const actor = n.actor_id ? actors.get(n.actor_id) : undefined;
            const target = targetForNotification(n);
            return (
              <li key={n.id} className={`relative ${!n.read ? "bg-primary/5" : ""}`}>
                <Link
                  to={target.to}
                  params={target.params as never}
                  onClick={() => { if (!n.read) markRead(n.id); }}
                  className="flex items-center gap-3 px-3 py-3"
                >
                  <div className="relative">
                    {actor?.photo_url ? (
                      <img src={actor.photo_url} alt="" className="h-11 w-11 rounded-full object-cover" />
                    ) : (
                      <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center font-semibold text-sm">
                        {(actor?.display_name ?? "•").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className={`absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full text-white flex items-center justify-center border-2 border-background ${tint}`}>
                      <Icon className="h-3 w-3" />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!n.read ? "font-medium" : ""} truncate`}>{n.body}</p>
                    <p className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)} ago</p>
                  </div>
                  {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                </Link>
                <button
                  onClick={() => remove(n.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground/0 hover:text-destructive hover:bg-muted rounded-full"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
