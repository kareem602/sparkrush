import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export function useVip() {
  const { user } = useAuth();
  const [isVip, setIsVip] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) {
      setIsVip(false);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("subscriptions")
      .select("status, plan, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();
    const active =
      !!data &&
      data.status === "active" &&
      data.plan !== "free" &&
      (!data.current_period_end || new Date(data.current_period_end) > new Date());
    setIsVip(active);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return { isVip, loading, refresh };
}
