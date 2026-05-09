import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const [p, setP] = useState<{ display_name: string; age: number | null; bio: string; photo_url: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name, age, bio, photo_url").eq("id", user.id).maybeSingle()
      .then(({ data }) => setP(data ?? null));
  }, [user]);

  if (!p) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">
      <div className="bg-card rounded-3xl shadow-card border border-border overflow-hidden">
        <div className="aspect-[4/3] bg-gradient-primary flex items-center justify-center text-primary-foreground text-6xl font-bold">
          {p.photo_url
            ? <img src={p.photo_url} alt={p.display_name} className="h-full w-full object-cover" />
            : p.display_name.charAt(0).toUpperCase()}
        </div>
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{p.display_name}{p.age && <span className="font-normal text-muted-foreground">, {p.age}</span>}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
            </div>
            <Link to="/onboarding" className="inline-flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm font-semibold hover:bg-accent transition">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
          </div>
          {p.bio && <p className="mt-4 text-sm text-foreground/90 whitespace-pre-line">{p.bio}</p>}
        </div>
      </div>
    </div>
  );
}
