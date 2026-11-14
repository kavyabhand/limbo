import { env } from "@/lib/server/env";
import { clientIp, handle, ok, rateLimit, track } from "@/lib/server/http";
import { issueAccessToken } from "@/lib/server/nexconn";
import { ensureUser } from "@/lib/server/session";
import { statePublicKey } from "@/lib/server/signing";

export const dynamic = "force-dynamic";

/**
 * Start (or resume) a guest session and mint a Nexconn access token.
 * The App Secret never leaves the server; the browser only gets a per-user token.
 */
export const POST = handle(async (req: Request) => {
  // Generous per IP: a whole terminal can share one public address on airport Wi-Fi.
  await rateLimit(`session:${clientIp(req)}`, 300, 60);
  const { user, created } = await ensureUser();
  const token = await issueAccessToken(user.id, user.display_name);
  if (created) void track("guest_created", user.id, null);
  return ok(
    {
      user: {
        id: user.id,
        name: user.display_name,
        color: user.avatar_color,
        language: user.language,
        agentOrg: user.is_agent ? user.agent_org : null,
      },
      nexconn: { appKey: env().NEXCONN_APP_KEY, token },
      statePublicKey: statePublicKey(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
