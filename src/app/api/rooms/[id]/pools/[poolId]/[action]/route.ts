import { z } from "zod";
import { HttpError, handle, ok, parseBody } from "@/lib/server/http";
import { claimSeat, closePool, releaseSeat } from "@/lib/server/pools";
import { assertWritable, requireMember } from "@/lib/server/rooms";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const closeBody = z.object({ status: z.enum(["done", "cancelled"]) });

/** POST …/pools/:poolId/claim | release | close */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string; poolId: string; action: string }> }) => {
  const { id, poolId, action } = await ctx.params;
  if (!UUID.test(poolId)) throw new HttpError(404, "no_pool", "That pool no longer exists.");
  const user = await requireUser();
  const room = await requireMember(id, user.id);
  assertWritable(room);
  switch (action) {
    case "claim":
      return ok(await claimSeat(room, user, poolId));
    case "release":
      return ok({ pool: await releaseSeat(room, user, poolId) });
    case "close": {
      const { status } = await parseBody(req, closeBody);
      return ok({ pool: await closePool(room, user, poolId, status) });
    }
    default:
      throw new HttpError(404, "not_found", "Unknown action.");
  }
});
