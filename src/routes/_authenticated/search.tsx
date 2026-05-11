import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { VerificationBadge, type VerificationLevel } from "@/components/verification-badge";
import { VipBadge } from "@/components/vip-badge";

export const Route = createFileRoute("/_authenticated/search")({
  component: SearchPage,
});

type Row = {
  id: string;
  display_name: string;
  age: number | null;
  hide_age: boolean;
  photo_url: string | null;
  verification_status: VerificationLevel;
  is_vip: boolean;
};

function SearchPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const term = q.trim();
    setLoading(true);
    const handle = setTimeout(async () => {
      let query = supabase
        .from("profiles")
        .select("id, display_name, age, hide_age, photo_url, verification_status")
        .eq("onboarded", true)
        .neq("id", user.id)
        .order("verification_status", { ascending: false })
        .limit(40);
      if (term.length > 0) query = query.ilike("display_name", `%${term}%`);

      const { data } = await query;
      const profs = (data ?? []) as Omit<Row, "is_vip">[];
      const ids = profs.map((p) => p.id);
      let vipIds = new Set<string>();
      if (ids.length > 0) {
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("user_id, status, plan, current_period_end")
          .in("user_id", ids);
        vipIds = new Set(
          (subs ?? [])
            .filter(
              (s) =>
                s.status === "active" &&
                s.plan !== "free" &&
                (!s.current_period_end || new Date(s.current_period_end) > new Date()),
            )
            .map((s) => s.user_id),
        );
      }
      setRows(profs.map((p) => ({ ...p, is_vip: vipIds.has(p.id) })));
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, user]);

  return (
    <div className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Search</h1>
      <p className="text-sm text-muted-foreground mt-1">Find people by name.</p>

      <div className="mt-4 relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name…"
          className="w-full h-11 pl-10 pr-4 rounded-full bg-card border border-border outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <ul className="mt-5 space-y-2">
        {loading && rows.length === 0 && (
          <li className="text-center text-muted-foreground py-8">Searching…</li>
        )}
        {!loading && rows.length === 0 && (
          <li className="text-center text-muted-foreground py-8">No people found.</li>
        )}
        {rows.map((r) => (
          <li key={r.id}>
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border">
              {r.photo_url ? (
                <img src={r.photo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center font-bold">
                  {r.display_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold flex items-center gap-1.5 truncate">
                  <span className="truncate">{r.display_name}</span>
                  <VerificationBadge status={r.verification_status} isVip={r.is_vip} size="sm" />
                  {r.is_vip && <VipBadge size="sm" />}
                </div>
                {!r.hide_age && r.age && (
                  <div className="text-xs text-muted-foreground">{r.age} years old</div>
                )}
              </div>
              <Link
                to="/discover"
                className="text-xs font-semibold text-primary px-3 py-1.5 rounded-full bg-primary/10"
              >
                View
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
