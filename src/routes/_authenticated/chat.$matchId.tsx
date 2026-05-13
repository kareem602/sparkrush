import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Send, Check, CheckCheck, Mic, Paperclip, X, Image as ImageIcon, Film } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useVip } from "@/hooks/use-vip";
import { Input } from "@/components/ui/input";
import { VipBadge } from "@/components/vip-badge";
import { VoiceRecorder } from "@/components/voice-recorder";
import { VoiceBubble } from "@/components/voice-bubble";

export const Route = createFileRoute("/_authenticated/chat/$matchId")({
  component: Chat,
});

type Kind = "text" | "image" | "video" | "audio";
type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  kind: Kind;
  media_url: string | null;
  duration_seconds: number | null;
  created_at: string;
  read_at: string | null;
};

const MAX_BYTES = 25 * 1024 * 1024;

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Chat() {
  const { matchId } = Route.useParams();
  const { user } = useAuth();
  const { isVip } = useVip();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<{ id: string; display_name: string; photo_url: string | null } | null>(null);
  const [otherIsVip, setOtherIsVip] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sentToday, setSentToday] = useState(0);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherLastSeen, setOtherLastSeen] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const presenceChan = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef<number>(0);
  const otherTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const FREE_DAILY_LIMIT = 5;

  // Initial load
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: m, error } = await supabase
        .from("matches").select("user1_id, user2_id").eq("id", matchId).maybeSingle();
      if (error || !m) { toast.error("Match not found"); return navigate({ to: "/matches" }); }
      const otherId = m.user1_id === user.id ? m.user2_id : m.user1_id;
      const { data: p } = await supabase
        .from("profiles").select("id, display_name, photo_url").eq("id", otherId).maybeSingle();
      setOther(p ?? { id: otherId, display_name: "Someone", photo_url: null });

      const { data: vipRow } = await supabase
        .from("subscriptions").select("status, plan, current_period_end").eq("user_id", otherId).maybeSingle();
      setOtherIsVip(
        !!vipRow && vipRow.status === "active" && vipRow.plan !== "free" &&
        (!vipRow.current_period_end || new Date(vipRow.current_period_end) > new Date())
      );

      const { data: msgs } = await supabase
        .from("messages").select("*").eq("match_id", matchId).order("created_at");
      setMessages((msgs ?? []) as Message[]);

      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("messages").select("*", { count: "exact", head: true })
        .eq("sender_id", user.id).gte("created_at", startOfDay.toISOString());
      setSentToday(count ?? 0);

      await supabase.from("messages").update({ read_at: new Date().toISOString() })
        .eq("match_id", matchId).neq("sender_id", user.id).is("read_at", null);
    })();
  }, [user, matchId, navigate]);

  // Realtime: messages
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`messages:${matchId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${matchId}`,
      }, async (payload) => {
        const m = payload.new as Message;
        setMessages((curr) => curr.some((x) => x.id === m.id) ? curr : [...curr, m]);
        if (m.sender_id !== user.id) {
          await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "messages", filter: `match_id=eq.${matchId}`,
      }, (payload) => {
        const m = payload.new as Message;
        setMessages((curr) => curr.map((x) => x.id === m.id ? m : x));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId, user]);

  // Realtime: presence + typing
  useEffect(() => {
    if (!user || !other) return;
    const ch = supabase.channel(`chat-presence:${matchId}`, { config: { presence: { key: user.id } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const others = Object.keys(state).filter((k) => k !== user.id);
      setOtherOnline(others.length > 0);
      if (others.length > 0) setOtherLastSeen(new Date().toISOString());
    });
    ch.on("broadcast", { event: "typing" }, (msg) => {
      const from = (msg.payload as { from?: string } | undefined)?.from;
      if (from && from !== user.id) {
        setOtherTyping(true);
        if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
        otherTypingTimer.current = setTimeout(() => setOtherTyping(false), 2500);
      }
    });
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await ch.track({ at: new Date().toISOString() });
    });
    presenceChan.current = ch;
    return () => {
      if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
      ch.untrack();
      supabase.removeChannel(ch);
      presenceChan.current = null;
    };
  }, [matchId, user, other]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, otherTyping]);

  const remaining = Math.max(0, FREE_DAILY_LIMIT - sentToday);
  const blocked = !isVip && remaining === 0;

  const broadcastTyping = () => {
    const now = Date.now();
    if (now - lastTypingSent.current < 1500) return;
    lastTypingSent.current = now;
    presenceChan.current?.send({ type: "broadcast", event: "typing", payload: { from: user?.id } });
  };

  const onTextChange = (v: string) => {
    setText(v);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (v.trim()) broadcastTyping();
    typingTimer.current = setTimeout(() => { /* noop, just debouncer slot */ }, 1500);
  };

  const insertMessage = async (payload: {
    content?: string;
    kind: Kind;
    media_url?: string | null;
    duration_seconds?: number | null;
  }) => {
    if (!user) return;
    if (blocked) { toast.error("Daily message limit reached. Upgrade to VIP for unlimited messages."); return; }
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      match_id: matchId,
      sender_id: user.id,
      content: payload.content ?? "",
      kind: payload.kind,
      media_url: payload.media_url ?? null,
      duration_seconds: payload.duration_seconds ?? null,
    });
    setSending(false);
    if (error) toast.error(error.message);
    else setSentToday((n) => n + 1);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setText("");
    await insertMessage({ content, kind: "text" });
  };

  const uploadAndSend = async (file: File) => {
    if (!user) return;
    if (file.size > MAX_BYTES) { toast.error("Max 25MB"); return; }
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) { toast.error("Only images and videos"); return; }
    if (blocked) { toast.error("Daily message limit reached. Upgrade to VIP for unlimited messages."); return; }
    setUploading(true);
    const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
    const path = `chat-media/${matchId}/${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
      contentType: file.type, upsert: false,
    });
    if (upErr) { setUploading(false); toast.error(upErr.message); return; }
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    await insertMessage({ kind: isImage ? "image" : "video", media_url: pub.publicUrl });
    setUploading(false);
  };

  const sendVoice = async (blob: Blob, duration: number) => {
    if (!user) return;
    if (blocked) { toast.error("Daily message limit reached. Upgrade to VIP for unlimited messages."); setRecording(false); return; }
    setUploading(true);
    const path = `chat-media/${matchId}/${user.id}/${crypto.randomUUID()}.webm`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, blob, {
      contentType: blob.type || "audio/webm", upsert: false,
    });
    if (upErr) { setUploading(false); setRecording(false); toast.error(upErr.message); return; }
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    await insertMessage({ kind: "audio", media_url: pub.publicUrl, duration_seconds: duration });
    setUploading(false);
    setRecording(false);
  };

  const lastMine = useMemo(() => [...messages].reverse().find((m) => m.sender_id === user?.id), [messages, user?.id]);
  const statusLabel = otherOnline
    ? "Online"
    : otherLastSeen ? `Last seen ${timeAgo(otherLastSeen)}` : "Offline";

  return (
    <div className="flex-1 flex flex-col h-screen">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-2xl px-3 h-14 flex items-center gap-3">
          <Link to="/matches" className="p-2 -ml-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
          {other && (
            <>
              <div className="relative">
                {other.photo_url ? (
                  <img src={other.photo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                    {other.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
                {otherOnline && (
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                )}
              </div>
              <div className="flex flex-col leading-tight min-w-0">
                <span className="font-semibold flex items-center gap-1.5 truncate">
                  {other.display_name}
                  {otherIsVip && <VipBadge size="sm" />}
                </span>
                <span className={`text-[11px] ${otherOnline ? "text-emerald-500" : "text-muted-foreground"}`}>
                  {otherTyping ? "typing…" : statusLabel}
                </span>
              </div>
            </>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-gradient-soft">
        <div className="mx-auto max-w-2xl space-y-2">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground mt-10">You matched! Send the first message ✨</p>
          )}
          {messages.map((m) => {
            const mine = m.sender_id === user?.id;
            const isLastMine = mine && lastMine && m.id === lastMine.id;
            const isMedia = m.kind !== "text";
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div className={`max-w-[78%] rounded-2xl text-sm overflow-hidden ${
                  mine ? "bg-gradient-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm"
                } ${isMedia && (m.kind === "image" || m.kind === "video") ? "p-1" : "px-4 py-2"}`}>
                  {m.kind === "text" && m.content}
                  {m.kind === "image" && m.media_url && (
                    <a href={m.media_url} target="_blank" rel="noreferrer">
                      <img src={m.media_url} alt="" className="max-h-72 rounded-xl object-cover" />
                    </a>
                  )}
                  {m.kind === "video" && m.media_url && (
                    <video src={m.media_url} controls className="max-h-80 rounded-xl" />
                  )}
                  {m.kind === "audio" && m.media_url && (
                    <div className="px-2">
                      <VoiceBubble url={m.media_url} duration={m.duration_seconds} mine={mine} />
                    </div>
                  )}
                </div>
                {isLastMine && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 mr-1 flex items-center gap-0.5">
                    {m.read_at ? (
                      isVip ? <><CheckCheck className="h-3 w-3 text-primary" /> Read</> : <><CheckCheck className="h-3 w-3" /> Sent</>
                    ) : (
                      <><Check className="h-3 w-3" /> Sent</>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {otherTyping && (
            <div className="flex items-end">
              <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={send} className="border-t border-border bg-background px-3 py-3">
        <div className="mx-auto max-w-2xl">
          {!isVip && (
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-2">
              <span>{remaining} of {FREE_DAILY_LIMIT} free messages left today</span>
              <Link to="/pricing" className="font-semibold text-primary">Upgrade</Link>
            </div>
          )}
          {recording ? (
            <VoiceRecorder onCancel={() => setRecording(false)} onSend={sendVoice} />
          ) : (
            <div className="flex items-center gap-2">
              <input
                ref={fileRef} type="file" accept="image/*,video/*" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAndSend(f); e.currentTarget.value = ""; }}
              />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={blocked || uploading}
                className="h-11 w-11 rounded-full bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center disabled:opacity-50"
                aria-label="Attach photo or video">
                {uploading ? <X className="h-5 w-5 animate-pulse" /> : <Paperclip className="h-5 w-5" />}
              </button>
              <Input
                value={text} onChange={(e) => onTextChange(e.target.value)}
                placeholder={blocked ? "Upgrade to VIP to keep chatting…" : "Type a message…"}
                maxLength={500} disabled={blocked}
                className="rounded-full h-11"
              />
              {text.trim() ? (
                <button type="submit" disabled={sending || blocked}
                  className="h-11 w-11 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
                  aria-label="Send">
                  <Send className="h-5 w-5" />
                </button>
              ) : (
                <button type="button" onClick={() => setRecording(true)} disabled={blocked}
                  className="h-11 w-11 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
                  aria-label="Record voice note">
                  <Mic className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
          {/* hint icons (visual cue only) */}
          <div className="sr-only">
            <ImageIcon /> <Film />
          </div>
        </div>
      </form>
    </div>
  );
}
