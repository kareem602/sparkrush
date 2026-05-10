import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useVip } from "@/hooks/use-vip";
import { VipBadge } from "@/components/vip-badge";

export const Route = createFileRoute("/_authenticated/likes-you")({
  component: LikesYou,
});

type Liker = { id: string; display_name: string; age: number | null; photo_url: string | null };

function LikesYou() {
  const { user } = useAuth();
  const { isVip, loading: vipLoading } = useVip();
  const [likers, setLikers] = useState<Liker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !isVip) { setLoading(false); return; }
    (async () => {
      // Find users who liked me but I haven't swiped on yet
      const { data: incoming } = await supabase
        .from("swipes").select("swiper_id").eq("swiped_id", user.id).eq("liked", true);
      const { data: mine } = await supabase
        .from("swipes").select("swiped_id").eq("swiper_id", user.id);
      const mineSet = new Set((mine ?? []).map((s) => s.swiped_id));
      const ids = [...new Set((incoming ?? []).map((s) => s.swiper_id))].filter((id) => !mineSet.has(id));
      if (ids.length === 0) { setLikers([]); setLoading(false); return; }
      const { data: profs } = await supabase
        .from("profiles").select("id, display_name, age, photo_url").in("id", ids);
      setLikers((profs as Liker[]) ?? []);
      setLoading(false);
    })();
  }, [user, isVip]);

  if (vipLoading || loading) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading…</div>;

  if (!isVip) {
    return (
      <div className="flex-1 mx-auto w-full max-w-md px-6 py-10 text-center">
        <div className="h-16 w-16 mx-auto rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 flex items-center justify-center text-white">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">See who liked you</h1>
        <p className="mt-2 text-sm text-muted-foreground">Skip the guesswork. Upgrade to VIP to instantly see everyone who already swiped right on you.</p>
        <Link to="/pricing" className="inline-block mt-6 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-white px-6 py-3 text-sm font-bold shadow-md">
          Upgrade to VIP
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Likes you</h1>
        <VipBadge size="sm" />
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        {likers.length} {likers.length === 1 ? "person has" : "people have"} liked your profile.
      </p>

      {likers.length === 0 ? (
        <div className="mt-12 text-center">
          <Heart className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">No likes yet — keep your profile fresh!</p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {likers.map((p) => (
            <Link key={p.id} to="/discover" className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-card border border-border shadow-soft group">
              {p.photo_url ? (
                <img src={p.photo_url} alt={p.display_name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-primary flex items-center justify-center text-primary-foreground text-4xl font-bold">
                  {p.display_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2.5 text-white">
                <p className="text-sm font-semibold truncate">
                  {p.display_name}{p.age ? `, ${p.age}` : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
