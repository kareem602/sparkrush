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
            <div className="min-w-0">
              <h1 className="text-2xl font-bold flex items-center gap-2 flex-wrap">
                <span>{p.display_name}</span>
                {!p.hide_age && p.age && <span className="font-normal text-muted-foreground">, {p.age}</span>}
                <VerificationBadge status={p.verification_status} isVip={isVip} size="sm" />
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
            </div>
            <Link to="/onboarding" className="inline-flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm font-semibold hover:bg-accent transition shrink-0">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
          </div>
          {p.bio && <p className="mt-4 text-sm text-foreground/90 whitespace-pre-line">{p.bio}</p>}
          {p.interests && p.interests.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {p.interests.map((i) => (
                <span key={i} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">{i}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Verification card */}
      {p.verification_status === "verified" ? (
        <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
          <VerificationBadge status="verified" isVip={isVip} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{isVip ? "Premium Verified" : "Verified"}</p>
            <p className="text-xs text-muted-foreground">{isVip ? "Top trust tier — verified + VIP." : "Identity confirmed. Become VIP to unlock the ⭐ Premium tier."}</p>
          </div>
        </div>
      ) : p.verification_status === "pending" ? (
        <div className="bg-card rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Verification pending</p>
            <p className="text-xs text-muted-foreground">We're reviewing your selfie. You'll get a badge soon.</p>
          </div>
        </div>
      ) : (
        <Link to="/verify" className="block bg-gradient-to-r from-sky-500 to-blue-500 text-white rounded-2xl p-4 shadow-card">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6" />
            <div className="flex-1">
              <p className="font-bold">Get verified</p>
              <p className="text-xs opacity-90">Earn a blue badge — rank higher and get more matches.</p>
            </div>
          </div>
        </Link>
      )}

      {/* Privacy toggles */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <p className="font-semibold">Privacy</p>
        <PrivacyToggle
          label="Hide my age"
          enabled={p.hide_age}
          onChange={async (v) => {
            const { error } = await supabase.from("profiles").update({ hide_age: v }).eq("id", user!.id);
            if (error) return toast.error(error.message);
            setP((prev) => prev ? { ...prev, hide_age: v } : prev);
          }}
        />
        <PrivacyToggle
          label="Hide my location"
          enabled={p.hide_location}
          onChange={async (v) => {
            const { error } = await supabase.from("profiles").update({ hide_location: v }).eq("id", user!.id);
            if (error) return toast.error(error.message);
            setP((prev) => prev ? { ...prev, hide_location: v } : prev);
          }}
        />
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
