import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Pencil, Rocket, Crown, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useVip } from "@/hooks/use-vip";
import { VipBadge } from "@/components/vip-badge";
import { VerificationBadge, type VerificationLevel } from "@/components/verification-badge";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

type Profile = {
  display_name: string;
  age: number | null;
  bio: string;
  photo_url: string | null;
  boost_until: string | null;
  hide_age: boolean;
  hide_location: boolean;
  verification_status: VerificationLevel;
  interests: string[];
};

function ProfilePage() {
  const { user } = useAuth();
  const { isVip } = useVip();
  const [p, setP] = useState<Profile | null>(null);
  const [boosting, setBoosting] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("display_name, age, bio, photo_url, boost_until, hide_age, hide_location, verification_status, interests")
      .eq("id", user.id)
      .maybeSingle();
    setP((data as Profile) ?? null);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const boostActive = p?.boost_until && new Date(p.boost_until) > new Date();

  const boost = async () => {
    if (!user || !isVip) return;
    setBoosting(true);
    const until = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
    const { error } = await supabase.from("profiles").update({ boost_until: until }).eq("id", user.id);
    setBoosting(false);
    if (error) return toast.error(error.message);
    toast.success("Boost activated for 30 minutes! 🚀");
    load();
  };

  if (!p) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="flex-1 mx-auto w-full max-w-2xl px-4 py-6 space-y-4">
      <div className="bg-card rounded-3xl shadow-card border border-border overflow-hidden">
        <div className="aspect-[4/3] bg-gradient-primary flex items-center justify-center text-primary-foreground text-6xl font-bold relative">
          {p.photo_url
            ? <img src={p.photo_url} alt={p.display_name} className="h-full w-full object-cover" />
            : p.display_name.charAt(0).toUpperCase()}
          {isVip && <div className="absolute top-3 right-3"><VipBadge /></div>}
          {boostActive && (
            <div className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2 py-1 text-xs font-semibold shadow-md">
              <Rocket className="h-3 w-3" /> Boosted
            </div>
          )}
        </div>
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {p.display_name}{p.age && <span className="font-normal text-muted-foreground">, {p.age}</span>}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
            </div>
            <Link to="/onboarding" className="inline-flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm font-semibold hover:bg-accent transition">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
          </div>
          {p.bio && <p className="mt-4 text-sm text-foreground/90 whitespace-pre-line">{p.bio}</p>}
        </div>
      </div>

      {isVip ? (
        <div className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold flex items-center gap-1.5"><Rocket className="h-4 w-4 text-primary" /> Profile Boost</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {boostActive
                ? `Active until ${new Date(p.boost_until!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Be one of the top profiles for 30 minutes."}
            </p>
          </div>
          <button
            onClick={boost}
            disabled={boosting || !!boostActive}
            className="rounded-full bg-gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-soft disabled:opacity-50"
          >
            {boostActive ? "Active" : "Boost"}
          </button>
        </div>
      ) : (
        <Link to="/pricing" className="block bg-gradient-to-r from-amber-500 to-yellow-400 text-white rounded-2xl p-4 shadow-card">
          <div className="flex items-center gap-3">
            <Crown className="h-6 w-6" />
            <div className="flex-1">
              <p className="font-bold">Upgrade to VIP</p>
              <p className="text-xs opacity-90">Boosts, unlimited messages, see who liked you & more.</p>
            </div>
          </div>
        </Link>
      )}
    </div>
  );
}
