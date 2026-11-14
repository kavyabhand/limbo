import { z } from "zod";
import { isAdminKey } from "@/lib/server/admin";
import { db } from "@/lib/server/db";
import { HttpError, handle, ok, parseBody } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const body = z.object({
  userId: z.string().regex(/^u[A-Za-z0-9]{20}$/),
  /** Organisation shown on the Official badge; null removes verification. */
  org: z.string().trim().min(2).max(64).nullable(),
});

/**
 * Verify (or un-verify) a staff account after manual onboarding. Their posts
 * then become Official cards. Usage:
 *   curl -X POST $APP_URL/api/admin/agents -H "x-admin-key: $ADMIN_KEY" \
 *        -H "content-type: application/json" -d '{"userId":"u…","org":"Air India"}'
 */
export const POST = handle(async (req: Request) => {
  if (!isAdminKey(req.headers.get("x-admin-key"))) throw new HttpError(401, "unauthorised", "Admin key required.");
  const { userId, org } = await parseBody(req, body);
  const rows = await db()`
    update users set is_agent = ${org !== null}, agent_org = ${org} where id = ${userId} and not is_sim returning id`;
  if (rows.length === 0) throw new HttpError(404, "no_user", "No such user.");
  return ok({ userId, org });
});
