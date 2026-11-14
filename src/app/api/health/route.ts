import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/** Liveness for the deploy and for judges: database + Nexconn Server API reachability. */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {};
  try {
    env();
    checks.config = "ok";
  } catch {
    checks.config = "fail";
  }
  try {
    await db()`select 1`;
    checks.database = "ok";
  } catch {
    checks.database = "fail";
  }
  try {
    // Any HTTP response (even 401 for an unsigned request) proves the API domain is reachable.
    const res = await fetch(`https://${env().NEXCONN_API_PRIMARY}/v4/auth/access-token/issue`, {
      method: "POST",
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    checks.nexconn = res.status > 0 ? "ok" : "fail";
  } catch {
    checks.nexconn = "fail";
  }
  const healthy = Object.values(checks).every((v) => v === "ok");
  return Response.json({ status: healthy ? "ok" : "degraded", checks }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
