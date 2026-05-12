import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type NotificationType = "message" | "match" | "post_like" | "comment" | "story_view";

export type Notification = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  body: string;
  match_id: string | null;
  post_id: string | null;
  story_id: string | null;
  message_id: string | null;
  read: boolean;
  created_at: string;
};

const SOUND_KEY = "notif_sound_enabled";

function playBeep() {
  try {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(SOUND_KEY) === "off") return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.start();
    o.stop(ctx.currentTime + 0.32);
    setTimeout(() => ctx.close(), 500);
  } catch { /* noop */ }
}

export function getSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SOUND_KEY) !== "off";
}
export function setSoundEnabled(v: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_KEY, v ? "on" : "off");
}

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const seenIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const list = (data ?? []) as Notification[];
    seenIds.current = new Set(list.map((n) => n.id));
    setItems(list);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as Notification;
          if (seenIds.current.has(n.id)) return;
          seenIds.current.add(n.id);
          setItems((prev) => [n, ...prev].slice(0, 50));
          playBeep();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => prev.map((x) => (x.id === n.id ? n : x)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const n = payload.old as Notification;
          setItems((prev) => prev.filter((x) => x.id !== n.id));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const unread = items.filter((n) => !n.read).length;

  const markAllRead = useCallback(async () => {
    if (!user) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).eq("recipient_id", user.id).eq("read", false);
  }, [user]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }, []);

  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  }, []);

  return { items, unread, loading, markAllRead, markRead, remove, reload: load };
}
