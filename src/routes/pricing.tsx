import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Crown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useVip } from "@/hooks/use-vip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/pricing")({
  component: Pricing,
  head: () => ({
    meta: [
      { title: "Pricing — Spark VIP" },
      { name: "description", content: "Unlock unlimited messages, see who liked you, profile boosts, and more with Spark VIP." },
    ],
  }),
});

const perks = [
  "Unlimited messages every day",
  "See everyone who liked you",
  "Unlimited swipes",
  "Monthly profile boost",
  "Read receipts in chat",
  "VIP badge on your profile",
];

function Pricing() {
  const { user } = useAuth();
  const { isVip, refresh } = useVip();

  const startSubscription = async () => {
    if (!user) return;
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    // Demo: insert a self-subscription. Real flow would create a Stripe checkout session.
    const { data: existing } = await supabase
      .from("subscriptions").select("id").eq("user_id", user.id).maybeSingle();
    const payload = {
      user_id: user.id,
      plan: "vip_monthly" as const,
      status: "active" as const,
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd.toISOString(),
    };
    const { error } = existing
      ? await supabase.from("subscriptions").update(payload).eq("user_id", user.id)
      : await supabase.from("subscriptions").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Welcome to VIP! 👑");
    refresh();
  };

  return (
    <div className="min-h-screen bg-gradient-soft px-4 py-10">
      <div className="mx-auto max-w-md text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-white shadow-md">
          <Crown className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Spark VIP</h1>
        <p className="mt-2 text-muted-foreground">Stand out, match more, message without limits.</p>

        <div className="mt-8 rounded-3xl bg-card border border-border shadow-card p-6 text-left">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-semibold">Monthly</span>
            <span className="text-3xl font-bold">$9.99<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
          </div>
          <ul className="mt-5 space-y-3">
            {perks.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-sm">
                <Check className="h-4 w-4 text-primary" /> {p}
              </li>
            ))}
          </ul>
          {user ? (
            isVip ? (
              <div className="mt-6 text-center text-sm text-muted-foreground">You're already a VIP 🎉</div>
            ) : (
              <button
                onClick={startSubscription}
                className="mt-6 w-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-white font-bold py-3 shadow-md hover:opacity-95"
              >
                Upgrade now
              </button>
            )
          ) : (
            <Link to="/auth" className="mt-6 block w-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-white text-center font-bold py-3 shadow-md">
              Sign in to upgrade
            </Link>
          )}
        </div>

        <Link to="/" className="inline-block mt-6 text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>
      </div>
    </div>
  );
}
