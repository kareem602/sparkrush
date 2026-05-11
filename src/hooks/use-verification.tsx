import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import type { VerificationLevel } from "@/components/verification-badge";

export function useVerification() {
  const { user } = useAuth();
  const [status, setStatus] = useState<VerificationLevel>("unverified");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) {
      setStatus("unverified");
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("verification_status")
      .eq("id", user.id)
      .maybeSingle();
    setStatus((data?.verification_status as VerificationLevel) ?? "unverified");
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return { status, loading, refresh };
}
