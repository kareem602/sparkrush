import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, MessageCircle, Sparkles, Shield } from "lucide-react";
import heroImg from "@/assets/hero.jpg";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="absolute top-0 inset-x-0 z-10">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary-foreground">
            <Heart className="h-6 w-6 fill-current" />
            <span className="font-bold text-lg tracking-tight">Spark</span>
          </div>
          <Link
            to={user ? "/discover" : "/auth"}
            className="rounded-full bg-white/95 backdrop-blur px-5 py-2 text-sm font-semibold text-primary shadow-soft hover:bg-white transition"
          >
            {user ? "Open app" : "Sign in"}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <img
          src={heroImg}
          alt=""
          width={1280}
          height={896}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="relative mx-auto max-w-6xl px-6 pt-32 pb-24 sm:pt-40 sm:pb-32 text-primary-foreground">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" /> New • Real-time chat
            </span>
            <h1 className="mt-5 text-5xl sm:text-6xl font-bold leading-[1.05] tracking-tight">
              Find your<br />spark tonight.
            </h1>
            <p className="mt-5 text-lg sm:text-xl text-white/90 max-w-xl">
              Swipe through real people nearby, match instantly, and chat in real time. Modern dating, made effortless.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={user ? "/discover" : "/auth"}
                className="rounded-full bg-white text-primary px-7 py-3.5 text-base font-semibold shadow-glow hover:scale-[1.02] transition"
              >
                {user ? "Start swiping" : "Get started — it's free"}
              </Link>
              <a href="#features" className="rounded-full border border-white/40 px-7 py-3.5 text-base font-semibold hover:bg-white/10 transition">
                Learn more
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-3xl sm:text-4xl font-bold text-center tracking-tight">Everything you need to connect</h2>
        <p className="mt-3 text-center text-muted-foreground max-w-xl mx-auto">
          Built for genuine connections — fast, safe, and mobile-first.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Heart, title: "Smart Matching", desc: "Mutual likes turn into matches instantly. No guessing." },
            { icon: MessageCircle, title: "Realtime Chat", desc: "Messages appear the moment they're sent. Stay in the moment." },
            { icon: Shield, title: "Safe & Private", desc: "Your data is encrypted and you control who sees your profile." },
          ].map((f) => (
            <div key={f.title} className="rounded-3xl bg-card p-7 shadow-soft border border-border">
              <div className="h-11 w-11 rounded-2xl bg-gradient-primary flex items-center justify-center text-primary-foreground shadow-soft">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Spark. Made with ♥
      </footer>
    </div>
  );
}
