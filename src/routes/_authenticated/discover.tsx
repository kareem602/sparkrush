import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Heart, X, MapPin, Sparkles, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useVip } from "@/hooks/use-vip";
import { VipBadge } from "@/components/vip-badge";

export const Route = createFileRoute("/_authenticated/discover")({
  component: Discover,
});

type Profile = {
  id: string;
  display_name: string;
  age: number | null;
  bio: string;
  photo_url: string | null;
  location: string | null;
  boost_until: string | null;
  is_vip?: boolean;
};

function Discover() {
  const { user } = useAuth();
  const { isVip } = useVip();
  const [stack, setStack] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [animating, setAnimating] = useState<"like" | "pass" | null>(null);
  const [swipesToday, setSwipesToday] = useState(0);
  const FREE_DAILY_SWIPES = 20;

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: swiped } = await supabase.from("swipes").select("swiped_id, created_at").eq("swiper_id", user.id);
    const excludeIds = [user.id, ...(swiped?.map((s) => s.swiped_id) ?? [])];
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    setSwipesToday((swiped ?? []).filter((s) => new Date(s.created_at) >= startOfDay).length);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, age, bio, photo_url, location, boost_until")
      .eq("onboarded", true)
      .not("id", "in", `(${excludeIds.join(",")})`)
      .limit(30);
    if (error) toast.error(error.message);
    const profs = (data ?? []) as Profile[];

    // Annotate VIP and sort: boosted first, then VIP, then random
    const ids = profs.map((p) => p.id);
    let vipIds = new Set<string>();
    if (ids.length > 0) {
      const { data: subs } = await supabase
        .from("subscriptions").select("user_id, status, plan, current_period_end").in("user_id", ids);
      vipIds = new Set(
        (subs ?? [])
          .filter((s) => s.status === "active" && s.plan !== "free" && (!s.current_period_end || new Date(s.current_period_end) > new Date()))
          .map((s) => s.user_id)
      );
    }
    const now = Date.now();
    const annotated = profs.map((p) => ({ ...p, is_vip: vipIds.has(p.id) }));
    annotated.sort((a, b) => {
      const aBoost = a.boost_until && new Date(a.boost_until).getTime() > now ? 2 : 0;
      const bBoost = b.boost_until && new Date(b.boost_until).getTime() > now ? 2 : 0;
      const aScore = aBoost + (a.is_vip ? 1 : 0);
      const bScore = bBoost + (b.is_vip ? 1 : 0);
      return bScore - aScore;
    });
    setStack(annotated);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const swipesLeft = Math.max(0, FREE_DAILY_SWIPES - swipesToday);
  const blocked = !isVip && swipesLeft === 0;

  const swipe = async (liked: boolean) => {
    if (!user || stack.length === 0 || animating) return;
    if (blocked) {
      toast.error("Daily swipe limit reached. Upgrade to VIP for unlimited swipes.");
      return;
    }
    const target = stack[0];
    setAnimating(liked ? "like" : "pass");
    setTimeout(async () => {
      setStack((s) => s.slice(1));
      setAnimating(null);
      setSwipesToday((n) => n + 1);
      const { error } = await supabase.from("swipes").insert({
        swiper_id: user.id, swiped_id: target.id, liked,
      });
      if (error) return toast.error(error.message);
      if (liked) {
        const { data: m } = await supabase
          .from("matches").select("id")
          .or(`and(user1_id.eq.${user.id},user2_id.eq.${target.id}),and(user1_id.eq.${target.id},user2_id.eq.${user.id})`)
          .maybeSingle();
        if (m) toast.success(`It's a match with ${target.display_name}! 💖`, { duration: 4000 });
      }
    }, 250);
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Finding people near you…</div>;
  }

  if (stack.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="h-20 w-20 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground shadow-glow">
          <Sparkles className="h-9 w-9" />
        </div>
        <h2 className="mt-5 text-xl font-bold">You're all caught up!</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-xs">Check back soon — new people join Spark every day.</p>
        <button onClick={load} className="mt-6 rounded-full bg-gradient-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">Refresh</button>
      </div>
    );
  }

  const top = stack[0];
  const next = stack[1];

  return (
    <div className="flex-1 flex flex-col items-center justify-between px-4 py-4 sm:py-8 bg-gradient-soft">
      <div className="relative w-full max-w-sm aspect-[3/4]">
        {next && <Card profile={next} className="absolute inset-0 scale-95 opacity-60" />}
        <Card
          profile={top}
          className={`absolute inset-0 transition-all duration-300 ${
            animating === "like" ? "translate-x-[120%] rotate-12 opacity-0" :
            animating === "pass" ? "-translate-x-[120%] -rotate-12 opacity-0" : ""
          }`}
        />
      </div>
      <div className="flex items-center gap-6 mt-6">
        <button
          onClick={() => swipe(false)}
          aria-label="Pass"
          className="h-16 w-16 rounded-full bg-card shadow-card border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:scale-105 transition"
        >
          <X className="h-7 w-7" strokeWidth={2.5} />
        </button>
        <button
          onClick={() => swipe(true)}
          aria-label="Like"
          className="h-20 w-20 rounded-full bg-gradient-primary shadow-glow flex items-center justify-center text-primary-foreground hover:scale-105 transition"
        >
          <Heart className="h-9 w-9 fill-current" />
        </button>
      </div>
    </div>
  );
}

function Card({ profile, className = "" }: { profile: Profile; className?: string }) {
  return (
    <div className={`rounded-3xl overflow-hidden bg-card shadow-card border border-border ${className}`}>
      <div className="relative h-full w-full">
        {profile.photo_url ? (
          <img src={profile.photo_url} alt={profile.display_name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-primary flex items-center justify-center text-primary-foreground text-7xl font-bold">
            {profile.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-5 text-white">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-bold">
              {profile.display_name}
              {profile.age && <span className="font-normal text-white/85">, {profile.age}</span>}
            </h2>
          </div>
          {profile.location && (
            <p className="text-sm text-white/85 mt-1 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {profile.location}</p>
          )}
          {profile.bio && <p className="text-sm text-white/90 mt-2 line-clamp-3">{profile.bio}</p>}
        </div>
      </div>
    </div>
  );
}
