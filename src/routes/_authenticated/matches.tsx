import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { VipBadge } from "@/components/vip-badge";
import { VerificationBadge, type VerificationLevel } from "@/components/verification-badge";

export const Route = createFileRoute("/_authenticated/matches")({
  component: Matches,
});

type Row = {
  matchId: string;
  other: { id: string; display_name: string; photo_url: string | null; is_vip: boolean; verification_status: VerificationLevel };
};

function Matches() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: matches } = await supabase
        .from("matches")
        .select("id, user1_id, user2_id, created_at")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      const otherIds = (matches ?? []).map((m) => (m.user1_id === user.id ? m.user2_id : m.user1_id));
      if (otherIds.length === 0) { setRows([]); setLoading(false); return; }
      const { data: profiles } = await supabase
        .from("profiles").select("id, display_name, photo_url").in("id", otherIds);
      const { data: subs } = await supabase
        .from("subscriptions").select("user_id, status, plan, current_period_end").in("user_id", otherIds);
      const vipIds = new Set(
        (subs ?? [])
          .filter((s) => s.status === "active" && s.plan !== "free" && (!s.current_period_end || new Date(s.current_period_end) > new Date()))
          .map((s) => s.user_id)
      );
      const byId = new Map(profiles?.map((p) => [p.id, p]) ?? []);
      setRows((matches ?? []).map((m) => {
        const otherId = m.user1_id === user.id ? m.user2_id : m.user1_id;
        const p = byId.get(otherId);
        return {
          matchId: m.id,
          other: {
            id: otherId,
            display_name: p?.display_name ?? "Someone",
            photo_url: p?.photo_url ?? null,
            is_vip: vipIds.has(otherId),
          },
        };
      }));
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Matches</h1>
      <p className="text-sm text-muted-foreground mt-1">Say hi and start a conversation.</p>

      {rows.length === 0 ? (
        <div className="mt-12 text-center">
          <div className="h-16 w-16 rounded-full bg-secondary mx-auto flex items-center justify-center">
            <MessageCircle className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="mt-4 text-muted-foreground">No matches yet — keep swiping!</p>
          <Link to="/discover" className="inline-block mt-4 rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Discover</Link>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {rows.map((r) => (
            <li key={r.matchId}>
              <Link
                to="/chat/$matchId" params={{ matchId: r.matchId }}
                className="flex items-center gap-4 p-3 rounded-2xl bg-card border border-border hover:bg-accent transition shadow-soft"
              >
                <Avatar name={r.other.display_name} url={r.other.photo_url} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold flex items-center gap-1.5 truncate">
                    {r.other.display_name}
                    {r.other.is_vip && <VipBadge size="sm" />}
                  </p>
                  <p className="text-xs text-muted-foreground">Tap to chat</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <img src={url} alt={name} className="h-14 w-14 rounded-full object-cover" />
  ) : (
    <div className="h-14 w-14 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
