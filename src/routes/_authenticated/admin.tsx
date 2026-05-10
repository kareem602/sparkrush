import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Crown, Shield, ShieldOff, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type Profile = {
  id: string;
  display_name: string;
  age: number | null;
  photo_url: string | null;
  created_at: string;
};
type Sub = {
  user_id: string;
  plan: string;
  status: string;
  current_period_end: string | null;
};
type Payment = {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  provider: string;
  provider_ref: string | null;
  description: string | null;
  created_at: string;
};

function AdminPage() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [subs, setSubs] = useState<Record<string, Sub>>({});
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        setIsAdmin(!!data);
        setLoading(false);
      });
  }, [user]);

  const load = async () => {
    const [{ data: ps }, { data: rs }, { data: ss }, { data: pays }] = await Promise.all([
      supabase.from("profiles").select("id,display_name,age,photo_url,created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("subscriptions").select("user_id,plan,status,current_period_end"),
      supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setProfiles((ps as Profile[]) ?? []);
    const rmap: Record<string, string[]> = {};
    (rs ?? []).forEach((r: any) => {
      rmap[r.user_id] = [...(rmap[r.user_id] ?? []), r.role];
    });
    setRoles(rmap);
    const smap: Record<string, Sub> = {};
    (ss ?? []).forEach((s: any) => (smap[s.user_id] = s));
    setSubs(smap);
    setPayments((pays as Payment[]) ?? []);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!isAdmin)
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-3">
        <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-semibold">Admin only</h1>
        <p className="text-sm text-muted-foreground">You don't have access to this page.</p>
      </div>
    );

  const toggleVip = async (userId: string) => {
    const current = subs[userId];
    if (current?.plan === "vip_monthly" && current.status === "active") {
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("user_id", userId);
      if (error) return toast.error(error.message);
      toast.success("VIP cancelled");
    } else {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      const payload = {
        user_id: userId,
        plan: "vip_monthly" as const,
        status: "active" as const,
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd.toISOString(),
      };
      const { error } = current
        ? await supabase.from("subscriptions").update(payload).eq("user_id", userId)
        : await supabase.from("subscriptions").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("VIP activated");
    }
    load();
  };

  const toggleAdmin = async (userId: string) => {
    const has = (roles[userId] ?? []).includes("admin");
    if (has) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      if (error) return toast.error(error.message);
      toast.success("Admin removed");
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) return toast.error(error.message);
      toast.success("Admin granted");
    }
    load();
  };

  const setPaymentStatus = async (id: string, status: "succeeded" | "refunded" | "failed") => {
    const { error } = await supabase.from("payments").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}`);
    load();
  };

  const profileById = (id: string) => profiles.find((p) => p.id === id);

  const totalRevenue = payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const activeVips = Object.values(subs).filter((s) => s.status === "active" && s.plan !== "free").length;
  const pendingPayments = payments.filter((p) => p.status === "pending").length;

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Users</div>
          <div className="text-2xl font-bold">{profiles.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Active VIPs</div>
          <div className="text-2xl font-bold">{activeVips}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Revenue</div>
          <div className="text-2xl font-bold">${(totalRevenue / 100).toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="text-2xl font-bold">{pendingPayments}</div>
        </Card>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-2">
          {profiles.map((p) => {
            const sub = subs[p.id];
            const isVip = sub?.status === "active" && sub.plan !== "free";
            const userRoles = roles[p.id] ?? [];
            const adminRole = userRoles.includes("admin");
            return (
              <Card key={p.id} className="p-3 flex items-center gap-3">
                {p.photo_url ? (
                  <img src={p.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-1.5">
                    {p.display_name || "Unnamed"}
                    {isVip && (
                      <Badge className="bg-gradient-to-r from-amber-500 to-yellow-400 text-white border-0 gap-1">
                        <Crown className="h-3 w-3" /> VIP
                      </Badge>
                    )}
                    {adminRole && <Badge variant="secondary">Admin</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.age ? `${p.age}y · ` : ""}joined {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button size="sm" variant={isVip ? "outline" : "default"} onClick={() => toggleVip(p.id)}>
                    <Crown className="h-3.5 w-3.5 mr-1" />
                    {isVip ? "Revoke VIP" : "Grant VIP"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleAdmin(p.id)}>
                    {adminRole ? <ShieldOff className="h-3.5 w-3.5 mr-1" /> : <Shield className="h-3.5 w-3.5 mr-1" />}
                    {adminRole ? "Remove" : "Make"} admin
                  </Button>
                </div>
              </Card>
            );
          })}
          {profiles.length === 0 && <p className="text-center text-muted-foreground py-8">No users yet.</p>}
        </TabsContent>

        <TabsContent value="payments" className="space-y-2">
          {payments.map((pay) => {
            const profile = profileById(pay.user_id);
            return (
              <Card key={pay.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{profile?.display_name ?? pay.user_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">
                      {pay.description ?? pay.provider} · {new Date(pay.created_at).toLocaleString()}
                    </div>
                    {pay.provider_ref && <div className="text-xs text-muted-foreground font-mono">{pay.provider_ref}</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      ${(pay.amount_cents / 100).toFixed(2)} {pay.currency.toUpperCase()}
                    </div>
                    <Badge
                      variant={
                        pay.status === "succeeded"
                          ? "default"
                          : pay.status === "pending"
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {pay.status}
                    </Badge>
                  </div>
                </div>
                {pay.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => setPaymentStatus(pay.id, "succeeded")}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPaymentStatus(pay.id, "failed")}>
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                )}
                {pay.status === "succeeded" && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => setPaymentStatus(pay.id, "refunded")}>
                      Refund
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
          {payments.length === 0 && <p className="text-center text-muted-foreground py-8">No payments yet.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
