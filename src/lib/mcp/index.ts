import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoami from "./tools/whoami";
import listMatches from "./tools/list-matches";
import listMessages from "./tools/list-messages";
import sendMessage from "./tools/send-message";
import listNotifications from "./tools/list-notifications";

// The OAuth issuer MUST be the direct Supabase host — the proxy URL fails RFC 8414
// issuer discovery. VITE_SUPABASE_PROJECT_ID is inlined at build time by Vite.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "spark-mcp",
  title: "Spark",
  version: "0.1.0",
  instructions:
    "Tools for the Spark dating app. Act as the signed-in user: read their profile, matches, messages, and notifications, and send new messages.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoami, listMatches, listMessages, sendMessage, listNotifications],
});
