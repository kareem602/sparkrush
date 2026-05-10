import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useVip } from "@/hooks/use-vip";
import { Input } from "@/components/ui/input";
import { VipBadge } from "@/components/vip-badge";

export const Route = createFileRoute("/_authenticated/chat/$matchId")({
  component: Chat,
});

type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const FREE_DAILY_LIMIT = 5;

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
      setMessages(msgs ?? []);

      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("messages").select("*", { count: "exact", head: true })
        .eq("sender_id", user.id).gte("created_at", startOfDay.toISOString());
      setSentToday(count ?? 0);

      await supabase.from("messages").update({ read_at: new Date().toISOString() })
        .eq("match_id", matchId).neq("sender_id", user.id).is("read_at", null);
    })();
  }, [user, matchId, navigate]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`messages:${matchId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `match_id=eq.${matchId}`,
      }, async (payload) => {
        const m = payload.new as Message;
        setMessages((curr) => curr.some((x) => x.id === m.id) ? curr : [...curr, m]);
        if (m.sender_id !== user.id) {
          await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "messages",
        filter: `match_id=eq.${matchId}`,
      }, (payload) => {
        const m = payload.new as Message;
        setMessages((curr) => curr.map((x) => x.id === m.id ? m : x));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId, user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const remaining = Math.max(0, FREE_DAILY_LIMIT - sentToday);
  const blocked = !isVip && remaining === 0;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || !user || sending) return;
    if (blocked) {
      toast.error("Daily message limit reached. Upgrade to VIP for unlimited messages.");
      return;
    }
    setSending(true);
    setText("");
    const { error } = await supabase.from("messages").insert({
      match_id: matchId, sender_id: user.id, content,
    });
    setSending(false);
    if (error) { toast.error(error.message); setText(content); }
    else setSentToday((n) => n + 1);
  };

  const lastMine = [...messages].reverse().find((m) => m.sender_id === user?.id);

  return (
    <div className="flex-1 flex flex-col h-screen">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-2xl px-3 h-14 flex items-center gap-3">
          <Link to="/matches" className="p-2 -ml-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
          {other && (
            <>
              {other.photo_url ? (
                <img src={other.photo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <div className="h-9 w-9 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                  {other.display_name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-semibold flex items-center gap-1.5">
                {other.display_name}
                {otherIsVip && <VipBadge size="sm" />}
              </span>
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
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                  mine ? "bg-gradient-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm"
                }`}>
                  {m.content}
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
          <div className="flex gap-2">
            <Input
              value={text} onChange={(e) => setText(e.target.value)}
              placeholder={blocked ? "Upgrade to VIP to keep chatting…" : "Type a message…"}
              maxLength={500} disabled={blocked}
              className="rounded-full h-11"
            />
            <button
              type="submit" disabled={!text.trim() || sending || blocked}
              className="h-11 w-11 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
