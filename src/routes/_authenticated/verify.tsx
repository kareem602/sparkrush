import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Camera, Clock, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useVerification } from "@/hooks/use-verification";

export const Route = createFileRoute("/_authenticated/verify")({
  component: VerifyPage,
});

function VerifyPage() {
  const { user } = useAuth();
  const { status, refresh } = useVerification();
  const [pendingReq, setPendingReq] = useState<{ id: string; created_at: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPending = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("verification_requests")
      .select("id, created_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setPendingReq(data ?? null);
  };

  useEffect(() => {
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const onPick = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large (max 5MB)");
      return;
    }
    setPreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    if (!user) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Pick a selfie first");
      return;
    }
    setSubmitting(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("verification")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (upErr) {
      setSubmitting(false);
      return toast.error(upErr.message);
    }
    const { error: insErr } = await supabase
      .from("verification_requests")
      .insert({ user_id: user.id, selfie_url: path });
    if (insErr) {
      setSubmitting(false);
      return toast.error(insErr.message);
    }
    await supabase
      .from("profiles")
      .update({ verification_status: "pending" })
      .eq("id", user.id);
    setSubmitting(false);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
    toast.success("Submitted! We'll review your selfie shortly.");
    refresh();
    loadPending();
  };

  return (
    <div className="flex-1 mx-auto w-full max-w-md px-4 py-6 space-y-5">
      <div className="text-center">
        <div className="h-16 w-16 mx-auto rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground shadow-glow">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">Get verified</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a clear selfie to earn a blue verification badge. Verified profiles get more matches and rank higher.
        </p>
      </div>

      {status === "verified" && (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 flex items-center gap-3">
          <BadgeCheck className="h-7 w-7 text-sky-500 fill-sky-500/15" strokeWidth={2.5} />
          <div className="min-w-0">
            <p className="font-semibold">You're verified</p>
            <p className="text-xs text-muted-foreground">
              Your blue badge is showing on your profile. Become VIP to upgrade to ⭐ Premium Verified.
            </p>
          </div>
        </div>
      )}

      {status === "pending" && pendingReq && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
          <Clock className="h-6 w-6 text-amber-500" />
          <div className="min-w-0">
            <p className="font-semibold">Under review</p>
            <p className="text-xs text-muted-foreground">
              Submitted {new Date(pendingReq.created_at).toLocaleString()}. We'll notify you once approved.
            </p>
          </div>
        </div>
      )}

      {(status === "unverified" || (status === "pending" && !pendingReq)) && (
        <div className="rounded-3xl border border-border bg-card p-5 space-y-4">
          <div>
            <p className="font-semibold">Take a selfie</p>
            <p className="text-xs text-muted-foreground mt-1">
              Face the camera, no sunglasses or hats. We compare it to your profile photo.
            </p>
          </div>

          <label className="block">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
            />
            <div className="aspect-square rounded-2xl bg-muted/40 border-2 border-dashed border-border flex items-center justify-center overflow-hidden cursor-pointer hover:bg-muted/70 transition">
              {preview ? (
                <img src={preview} alt="Selfie preview" className="h-full w-full object-cover" />
              ) : (
                <div className="text-center text-muted-foreground">
                  <Camera className="h-10 w-10 mx-auto" />
                  <p className="mt-2 text-sm font-medium">Tap to take or choose photo</p>
                </div>
              )}
            </div>
          </label>

          <button
            onClick={submit}
            disabled={submitting || !preview}
            className="w-full h-11 rounded-full bg-gradient-primary text-primary-foreground font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <Upload className="h-4 w-4" /> {submitting ? "Uploading…" : "Submit for review"}
          </button>
        </div>
      )}

      <Link
        to="/profile"
        className="block text-center text-sm text-muted-foreground hover:text-foreground"
      >
        Back to profile
      </Link>
    </div>
  );
}
