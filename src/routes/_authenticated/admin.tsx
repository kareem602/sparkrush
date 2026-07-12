import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Crown, Shield, ShieldOff, CheckCircle2, XCircle, RefreshCw, BadgeCheck,
  Ban, Star, Trash2, Megaphone, Flag,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type Profile = {
  id: string; display_name: string; age: number | null; photo_url: string | null;
  created_at: string; is_banned: boolean; suspended_until: string | null; featured: boolean;
  verification_status: string | null;
};
type Sub = { user_id: string; plan: string; status: string; current_period_end: string | null };
type Payment = {
  id: string; user_id: string; amount_cents: number; currency: string;
  status: string; provider: string; provider_ref: string | null;
  description: string | null; created_at: string;
};
type VReq = { id: string; user_id: string; selfie_url: string; created_at: string };
type Report = {
  id: string; reporter_id: string; target_type: string; target_id: string;
  reason: string; status: string; created_at: string;
};
type Post = { id: string; author_id: string; caption: string | null; media_url: string; featured: boolean; created_at: string };

function AdminPage() {
  const { user } = useAuth();
  const [role, setRole] = useState<"owner" | "admin" | null>(null);
  const [loading, setLoading] = useState(true);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [subs, setSubs] = useState<Record<string, Sub>>({});
  const [payments, setPayments] = useState<Payment[]>([]);
  const [vreqs, setVreqs] = useState<VReq[]>([]);
  const [selfieUrls, setSelfieUrls] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Report[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "owner"]).then(({ data }) => {
      const rs = (data ?? []).map((r: any) => r.role);
      setRole(rs.includes("owner") ? "owner" : rs.includes("admin") ? "admin" : null);
      setLoading(false);
    });
  }, [user]);

  const isOwner = role === "owner";
  const isStaff = role === "owner" || role === "admin";

  const load = async () => {
    const [{ data: ps }, { data: rs }, { data: ss }, { data: pays }, { data: vrs }, { data: rps }, { data: pos }] = await Promise.all([
      supabase.from("profiles").select("id,display_name,age,photo_url,created_at,is_banned,suspended_until,featured,verification_status").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("subscriptions").select("user_id,plan,status,current_period_end"),
      supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("verification_requests").select("id,user_id,selfie_url,created_at").eq("status", "pending").order("created_at", { ascending: true }),
      supabase.from("reports").select("*").eq("status", "open").order("created_at", { ascending: false }),
      supabase.from("posts").select("id,author_id,caption,media_url,featured,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    setProfiles((ps as Profile[]) ?? []);
    const rmap: Record<string, string[]> = {};
    (rs ?? []).forEach((r: any) => { rmap[r.user_id] = [...(rmap[r.user_id] ?? []), r.role]; });
    setRoles(rmap);
    const smap: Record<string, Sub> = {};
    (ss ?? []).forEach((s: any) => (smap[s.user_id] = s));
    setSubs(smap);
    setPayments((pays as Payment[]) ?? []);
    const vlist = (vrs as VReq[]) ?? [];
    setVreqs(vlist);
    setReports((rps as Report[]) ?? []);
    setPosts((pos as Post[]) ?? []);
    const urlMap: Record<string, string> = {};
    await Promise.all(vlist.map(async (v) => {
      const { data } = await supabase.storage.from("verification").createSignedUrl(v.selfie_url, 3600);
      if (data?.signedUrl) urlMap[v.id] = data.signedUrl;
    }));
    setSelfieUrls(urlMap);
  };

  useEffect(() => { if (isStaff) load(); }, [isStaff]);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!isStaff)
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-3">
        <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-semibold">Staff only</h1>
        <p className="text-sm text-muted-foreground">You don't have access to this page.</p>
      </div>
    );

  const err = (e: any) => e && toast.error(e.message);

  const toggleVip = async (userId: string) => {
    const current = subs[userId];
    if (current?.plan === "vip_monthly" && current.status === "active") {
      err((await supabase.from("subscriptions").update({ status: "cancelled" }).eq("user_id", userId)).error);
      toast.success("VIP revoked");
    } else {
      const periodEnd = new Date(); periodEnd.setMonth(periodEnd.getMonth() + 1);
      const payload = { user_id: userId, plan: "vip_monthly" as const, status: "active" as const,
        current_period_start: new Date().toISOString(), current_period_end: periodEnd.toISOString() };
      const res = current
        ? await supabase.from("subscriptions").update(payload).eq("user_id", userId)
        : await supabase.from("subscriptions").insert(payload);
      err(res.error);
      toast.success("VIP granted");
    }
    load();
  };

  const toggleRole = async (userId: string, r: "admin" | "owner") => {
    if (!isOwner) return toast.error("Owner only");
    const has = (roles[userId] ?? []).includes(r);
    if (has) {
      if (r === "owner" && userId === user!.id) return toast.error("Can't remove your own owner role");
      err((await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", r)).error);
      toast.success(`${r} removed`);
    } else {
      err((await supabase.from("user_roles").insert({ user_id: userId, role: r }).select()).error);
      toast.success(`${r} granted`);
    }
    load();
  };

  const setVerification = async (userId: string, status: "verified" | "unverified") => {
    err((await supabase.from("profiles").update({ verification_status: status }).eq("id", userId)).error);
    toast.success(`Marked ${status}`); load();
  };

  const toggleBan = async (p: Profile) => {
    err((await supabase.from("profiles").update({ is_banned: !p.is_banned }).eq("id", p.id)).error);
    toast.success(p.is_banned ? "Unbanned" : "Banned"); load();
  };

  const suspend = async (p: Profile, days: number) => {
    const until = days === 0 ? null : new Date(Date.now() + days * 86400_000).toISOString();
    err((await supabase.from("profiles").update({ suspended_until: until }).eq("id", p.id)).error);
    toast.success(days === 0 ? "Suspension lifted" : `Suspended ${days}d`); load();
  };

  const toggleFeaturedUser = async (p: Profile) => {
    err((await supabase.from("profiles").update({ featured: !p.featured }).eq("id", p.id)).error);
    load();
  };

  const toggleFeaturedPost = async (p: Post) => {
    err((await supabase.from("posts").update({ featured: !p.featured }).eq("id", p.id)).error);
    load();
  };

  const deletePost = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    err((await supabase.from("posts").delete().eq("id", id)).error);
    toast.success("Deleted"); load();
  };

  const resolveReport = async (id: string, status: "resolved" | "dismissed") => {
    err((await supabase.from("reports").update({ status, resolver_id: user!.id, resolved_at: new Date().toISOString() }).eq("id", id)).error);
    load();
  };

  const decideVerification = async (req: VReq, status: "approved" | "rejected") => {
    err((await supabase.from("verification_requests").update({ status, reviewer_id: user!.id, reviewed_at: new Date().toISOString() }).eq("id", req.id)).error);
    toast.success(`Request ${status}`); load();
  };

  const setPaymentStatus = async (id: string, status: "succeeded" | "refunded" | "failed") => {
    err((await supabase.from("payments").update({ status }).eq("id", id)).error);
    toast.success(`Marked ${status}`); load();
  };

  const sendAnnouncement = async () => {
    if (!annTitle.trim() || !annBody.trim()) return toast.error("Title and body required");
    const { error } = await supabase.from("announcements").insert({ author_id: user!.id, title: annTitle, body: annBody });
    if (error) return toast.error(error.message);
    toast.success("Announcement sent to all users");
    setAnnTitle(""); setAnnBody("");
  };

  const profileById = (id: string) => profiles.find((p) => p.id === id);
  const totalRevenue = payments.filter((p) => p.status === "succeeded").reduce((s, p) => s + p.amount_cents, 0);
  const activeVips = Object.values(subs).filter((s) => s.status === "active" && s.plan !== "free").length;

  const filtered = profiles.filter((p) =>
    !search || (p.display_name ?? "").toLowerCase().includes(search.toLowerCase()) || p.id.startsWith(search));

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {isOwner ? <Crown className="h-6 w-6 text-amber-500" /> : <Shield className="h-6 w-6" />}
            {isOwner ? "Owner" : "Admin"} Dashboard
          </h1>
          <p className="text-xs text-muted-foreground">
            {isOwner ? "Full control over the platform" : "Moderation access"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Users</div><div className="text-2xl font-bold">{profiles.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Active VIPs</div><div className="text-2xl font-bold">{activeVips}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-2xl font-bold">${(totalRevenue / 100).toFixed(2)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Open reports</div><div className="text-2xl font-bold">{reports.length}</div></Card>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="w-full grid grid-cols-6">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="verify">Verify {vreqs.length > 0 && <span className="ml-1 px-1 rounded-full bg-primary text-primary-foreground text-[10px]">{vreqs.length}</span>}</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="reports">Reports {reports.length > 0 && <span className="ml-1 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px]">{reports.length}</span>}</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="announce">Announce</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-2">
          <Input placeholder="Search by name or id…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {filtered.map((p) => {
            const sub = subs[p.id];
            const isVip = sub?.status === "active" && sub.plan !== "free";
            const userRoles = roles[p.id] ?? [];
            const isUserOwner = userRoles.includes("owner");
            const isUserAdmin = userRoles.includes("admin");
            const suspended = p.suspended_until && new Date(p.suspended_until) > new Date();
            return (
              <Card key={p.id} className="p-3">
                <div className="flex items-center gap-3">
                  {p.photo_url ? <img src={p.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="h-10 w-10 rounded-full bg-muted" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-1.5 flex-wrap">
                      {p.display_name || "Unnamed"}
                      {isUserOwner && <Badge className="bg-amber-500 text-white border-0 gap-1"><Crown className="h-3 w-3" /> Owner</Badge>}
                      {isUserAdmin && !isUserOwner && <Badge variant="secondary">Admin</Badge>}
                      {isVip && <Badge className="bg-gradient-to-r from-amber-500 to-yellow-400 text-white border-0"><Crown className="h-3 w-3 mr-1" />VIP</Badge>}
                      {p.verification_status === "verified" && <Badge className="bg-sky-500 text-white border-0"><BadgeCheck className="h-3 w-3 mr-1" />Verified</Badge>}
                      {p.is_banned && <Badge variant="destructive">Banned</Badge>}
                      {suspended && <Badge variant="destructive">Suspended</Badge>}
                      {p.featured && <Badge className="bg-fuchsia-500 text-white border-0"><Star className="h-3 w-3 mr-1" />Featured</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{p.id.slice(0, 8)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <Button size="sm" variant={isVip ? "outline" : "default"} onClick={() => toggleVip(p.id)}>
                    <Crown className="h-3.5 w-3.5 mr-1" />{isVip ? "Revoke VIP" : "Grant VIP"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setVerification(p.id, p.verification_status === "verified" ? "unverified" : "verified")}>
                    <BadgeCheck className="h-3.5 w-3.5 mr-1" />{p.verification_status === "verified" ? "Unverify" : "Verify"}
                  </Button>
                  <Button size="sm" variant={p.is_banned ? "outline" : "destructive"} onClick={() => toggleBan(p)}>
                    <Ban className="h-3.5 w-3.5 mr-1" />{p.is_banned ? "Unban" : "Ban"}
                  </Button>
                  {suspended
                    ? <Button size="sm" variant="outline" onClick={() => suspend(p, 0)}>Lift suspension</Button>
                    : <Button size="sm" variant="outline" onClick={() => suspend(p, 7)}>Suspend 7d</Button>}
                  <Button size="sm" variant="outline" onClick={() => toggleFeaturedUser(p)}>
                    <Star className="h-3.5 w-3.5 mr-1" />{p.featured ? "Unfeature" : "Feature"}
                  </Button>
                  {isOwner && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => toggleRole(p.id, "admin")}>
                        {isUserAdmin ? <ShieldOff className="h-3.5 w-3.5 mr-1" /> : <Shield className="h-3.5 w-3.5 mr-1" />}
                        {isUserAdmin ? "Remove admin" : "Make admin"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleRole(p.id, "owner")}>
                        <Crown className="h-3.5 w-3.5 mr-1" />{isUserOwner ? "Remove owner" : "Make owner"}
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="verify" className="space-y-2">
          {vreqs.length === 0 && <p className="text-center text-muted-foreground py-8">No pending requests.</p>}
          {vreqs.map((v) => {
            const profile = profileById(v.user_id);
            return (
              <Card key={v.id} className="p-3 flex items-center gap-3">
                {selfieUrls[v.id] ? <img src={selfieUrls[v.id]} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <div className="h-16 w-16 rounded-xl bg-muted" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{profile?.display_name ?? v.user_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button size="sm" onClick={() => decideVerification(v, "approved")}><BadgeCheck className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => decideVerification(v, "rejected")}><XCircle className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="posts" className="space-y-2">
          {posts.length === 0 && <p className="text-center text-muted-foreground py-8">No posts.</p>}
          {posts.map((p) => {
            const author = profileById(p.author_id);
            return (
              <Card key={p.id} className="p-3 flex items-center gap-3">
                <img src={p.media_url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{author?.display_name ?? "Unknown"}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.caption || "—"}</div>
                  {p.featured && <Badge className="bg-fuchsia-500 text-white border-0 mt-1"><Star className="h-3 w-3 mr-1" />Featured</Badge>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => toggleFeaturedPost(p)}>
                    <Star className="h-3.5 w-3.5 mr-1" />{p.featured ? "Unfeature" : "Feature"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deletePost(p.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="reports" className="space-y-2">
          {reports.length === 0 && <p className="text-center text-muted-foreground py-8">No open reports.</p>}
          {reports.map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-1.5">
                    <Flag className="h-4 w-4 text-destructive" />
                    {r.target_type} report
                  </div>
                  <div className="text-xs text-muted-foreground">Target: <span className="font-mono">{r.target_id.slice(0, 8)}</span> · {new Date(r.created_at).toLocaleString()}</div>
                  <p className="text-sm mt-1">{r.reason}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button size="sm" onClick={() => resolveReport(r.id, "resolved")}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Resolve</Button>
                  <Button size="sm" variant="outline" onClick={() => resolveReport(r.id, "dismissed")}>Dismiss</Button>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="payments" className="space-y-2">
          {payments.map((pay) => {
            const profile = profileById(pay.user_id);
            return (
              <Card key={pay.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{profile?.display_name ?? pay.user_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{pay.description ?? pay.provider} · {new Date(pay.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">${(pay.amount_cents / 100).toFixed(2)} {pay.currency.toUpperCase()}</div>
                    <Badge variant={pay.status === "succeeded" ? "default" : pay.status === "pending" ? "secondary" : "destructive"}>{pay.status}</Badge>
                  </div>
                </div>
                {pay.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => setPaymentStatus(pay.id, "succeeded")}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => setPaymentStatus(pay.id, "failed")}><XCircle className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                  </div>
                )}
                {pay.status === "succeeded" && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => setPaymentStatus(pay.id, "refunded")}>Refund</Button>
                  </div>
                )}
              </Card>
            );
          })}
          {payments.length === 0 && <p className="text-center text-muted-foreground py-8">No payments yet.</p>}
        </TabsContent>

        <TabsContent value="announce" className="space-y-3">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold"><Megaphone className="h-4 w-4" /> Send announcement to every user</div>
            <Input placeholder="Title" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} />
            <Textarea placeholder="Message body…" value={annBody} onChange={(e) => setAnnBody(e.target.value)} rows={4} />
            <Button onClick={sendAnnouncement} className="w-full"><Megaphone className="h-4 w-4 mr-2" /> Broadcast</Button>
            <p className="text-xs text-muted-foreground">Every user gets a notification with a chime.</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
