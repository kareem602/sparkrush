import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, Compass, MessageCircle, User as UserIcon, LogOut, Shield, Star, Search, Sparkles } from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

function AuthGate() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("onboarded").eq("id", user.id).maybeSingle().then(({ data }) => {
      setOnboarded(!!data?.onboarded);
    });
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle().then(({ data }) => {
      setIsAdmin(!!data);
    });
  }, [user]);

  useEffect(() => {
    if (onboarded === false && !location.pathname.startsWith("/onboarding")) {
      navigate({ to: "/onboarding" });
    }
  }, [onboarded, location.pathname, navigate]);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const isOnboarding = location.pathname.startsWith("/onboarding");
  const isChat = location.pathname.startsWith("/chat/");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {!isOnboarding && !isChat && (
        <header className="sticky top-0 z-20 bg-background/85 backdrop-blur border-b border-border">
          <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between gap-2">
            <Link to="/discover" className="flex items-center gap-1.5 text-primary">
              <Heart className="h-5 w-5 fill-current" />
              <span className="font-bold">Spark</span>
            </Link>
            <div className="flex items-center gap-1">
              <Link to="/search" className="text-muted-foreground hover:text-foreground p-2" aria-label="Search">
                <Search className="h-5 w-5" />
              </Link>
              <button onClick={() => signOut().then(() => navigate({ to: "/" }))} className="text-muted-foreground hover:text-foreground p-2" aria-label="Sign out">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>
      )}

      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>

      {!isOnboarding && !isChat && (
        <nav className="sticky bottom-0 z-20 bg-background/90 backdrop-blur border-t border-border">
          <div className={`mx-auto max-w-2xl grid ${isAdmin ? "grid-cols-5" : "grid-cols-4"}`}>
            {[
              { to: "/discover", icon: Compass, label: "Discover" },
              { to: "/likes-you" as const, icon: Star, label: "Likes" },
              { to: "/matches", icon: MessageCircle, label: "Matches" },
              { to: "/profile", icon: UserIcon, label: "Profile" },
              ...(isAdmin ? [{ to: "/admin" as const, icon: Shield, label: "Admin" }] : []),
            ].map((t) => {
              const active = location.pathname.startsWith(t.to);
              return (
                <Link key={t.to} to={t.to} className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
                  <t.icon className={`h-5 w-5 ${active ? "fill-current/10" : ""}`} />
                  {t.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
