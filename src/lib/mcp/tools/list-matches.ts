import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_matches",
  title: "List matches",
  description: "List the signed-in user's mutual matches with the other person's profile.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe("Max matches to return"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const uid = ctx.getUserId();
    const { data: matches, error } = await supabase
      .from("matches")
      .select("id,user1_id,user2_id,created_at")
      .or(`user1_id.eq.${uid},user2_id.eq.${uid}`)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const otherIds = (matches ?? []).map((m) => (m.user1_id === uid ? m.user2_id : m.user1_id));
    const { data: profiles } = otherIds.length
      ? await supabase.from("profiles").select("id,display_name,age,photo_url,city").in("id", otherIds)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const enriched = (matches ?? []).map((m) => {
      const otherId = m.user1_id === uid ? m.user2_id : m.user1_id;
      return { match_id: m.id, matched_at: m.created_at, other: byId.get(otherId) ?? { id: otherId } };
    });
    return {
      content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }],
      structuredContent: { matches: enriched },
    };
  },
});
