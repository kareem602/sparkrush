import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

type Gender = "male" | "female" | "nonbinary" | "other";

const INTEREST_OPTIONS = [
  "Travel", "Music", "Movies", "Fitness", "Foodie", "Coffee", "Hiking",
  "Gaming", "Art", "Photography", "Reading", "Yoga", "Dancing", "Tech",
  "Pets", "Fashion", "Cooking", "Nightlife",
];

function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const [interestedIn, setInterestedIn] = useState<Gender>("male");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [hideAge, setHideAge] = useState(false);
  const [hideLocation, setHideLocation] = useState(false);
  const [messagePolicy, setMessagePolicy] = useState<"everyone" | "matches">("matches");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setName(data.display_name || "");
        setAge(data.age ? String(data.age) : "");
        if (data.gender) setGender(data.gender);
        if (data.interested_in) setInterestedIn(data.interested_in);
        setBio(data.bio || "");
        setPhotoUrl(data.photo_url || "");
        setInterests(data.interests ?? []);
        setHideAge(!!data.hide_age);
        setHideLocation(!!data.hide_location);
        if (data.message_policy) setMessagePolicy(data.message_policy);
      }
    });
  }, [user]);

  const toggleInterest = (i: string) => {
    setInterests((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const ageN = parseInt(age, 10);
    if (Number.isNaN(ageN) || ageN < 18 || ageN > 100) {
      return toast.error("Please enter a valid age (18+)");
    }
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      display_name: name.trim(),
      age: ageN,
      gender, interested_in: interestedIn,
      bio: bio.trim(),
      photo_url: photoUrl.trim() || null,
      interests,
      hide_age: hideAge,
      hide_location: hideLocation,
      message_policy: messagePolicy,
      onboarded: true,
    }).eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved!");
    navigate({ to: "/discover" });
  };

  return (
    <div className="flex-1 bg-gradient-soft py-8 px-4">
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-2 text-primary mb-6">
          <Heart className="h-6 w-6 fill-current" />
          <span className="font-bold text-xl">Spark</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Set up your profile</h1>
        <p className="text-sm text-muted-foreground mt-1">A great profile gets more matches.</p>

        <form onSubmit={submit} className="mt-6 space-y-4 bg-card rounded-3xl p-6 shadow-soft border border-border">
          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="age">Age</Label>
            <Input id="age" type="number" value={age} onChange={(e) => setAge(e.target.value)} required min={18} max={100} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>I am</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Woman</SelectItem>
                  <SelectItem value="male">Man</SelectItem>
                  <SelectItem value="nonbinary">Non-binary</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Interested in</Label>
              <Select value={interestedIn} onValueChange={(v) => setInterestedIn(v as Gender)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Women</SelectItem>
                  <SelectItem value="male">Men</SelectItem>
                  <SelectItem value="nonbinary">Non-binary</SelectItem>
                  <SelectItem value="other">Everyone</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="photo">Photo URL</Label>
            <Input id="photo" placeholder="https://…" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
            <p className="text-xs text-muted-foreground">Paste a link to a profile photo.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3} placeholder="A line or two about you…" />
          </div>
          <div className="space-y-1.5">
            <Label>Interests</Label>
            <div className="flex flex-wrap gap-1.5">
              {INTEREST_OPTIONS.map((i) => {
                const active = interests.includes(i);
                return (
                  <button
                    type="button"
                    key={i}
                    onClick={() => toggleInterest(i)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium border transition ${active ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border hover:bg-accent"}`}
                  >
                    {i}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Privacy</Label>
            <label className="flex items-center justify-between text-sm py-1.5">
              <span>Hide my age</span>
              <input type="checkbox" checked={hideAge} onChange={(e) => setHideAge(e.target.checked)} className="h-4 w-4 accent-primary" />
            </label>
            <label className="flex items-center justify-between text-sm py-1.5">
              <span>Hide my location</span>
              <input type="checkbox" checked={hideLocation} onChange={(e) => setHideLocation(e.target.checked)} className="h-4 w-4 accent-primary" />
            </label>
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs text-muted-foreground">Who can message me</Label>
              <Select value={messagePolicy} onValueChange={(v) => setMessagePolicy(v as "everyone" | "matches")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="matches">Matches only</SelectItem>
                  <SelectItem value="everyone">Everyone</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" disabled={busy} className="w-full h-11 rounded-full bg-gradient-primary text-primary-foreground font-semibold border-0">
            {busy ? "Saving…" : "Save & start matching"}
          </Button>
        </form>
      </div>
    </div>
  );
}
