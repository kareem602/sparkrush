import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/chat/$matchId")({
  component: Chat,
});

type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

function Chat() {
  const { matchId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<{ display_name: string; photo_url: string | null } | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: m, error } = await supabase
        .from("matches").select("user1_id, user2_id").eq("id", matchId).maybeSingle();
      if (error || !m) { toast.error("Match not found"); return navigate({ to: "/matches" }); }
      const otherId = m.user1_id === user.id ? m.user2_id : m.user1_id;
      const { data: p } = await supabase
        .from("profiles").select("display_name, photo_url").eq("id", otherId).maybeSingle();
      setOther(p ?? { display_name: "Someone", photo_url: null });

      const { data: msgs } = await supabase
        .from("messages").select("*").eq("match_id", matchId).order("created_at");
      setMessages(msgs ?? []);
    })();
  }, [user, matchId, navigate]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`messages:${matchId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `match_id=eq.${matchId}`,
      }, (payload) => {
        setMessages((curr) => {
          const m = payload.new as Message;
          if (curr.some((x) => x.id === m.id)) return curr;
          return [...curr, m];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId, user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || !user || sending) return;
    setSending(true);
    setText("");
    const { error } = await supabase.from("messages").insert({
      match_id: matchId, sender_id: user.id, content,
    });
    setSending(false);
    if (error) { toast.error(error.message); setText(content); }
  };

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
              <span className="font-semibold">{other.display_name}</span>
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
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                  mine ? "bg-gradient-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm"
                }`}>
                  {m.content}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={send} className="border-t border-border bg-background px-3 py-3">
        <div className="mx-auto max-w-2xl flex gap-2">
          <Input
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…" maxLength={500}
            className="rounded-full h-11"
          />
          <button
            type="submit" disabled={!text.trim() || sending}
            className="h-11 w-11 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
