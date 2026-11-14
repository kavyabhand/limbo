import { listCards } from "@/lib/server/cards";
import { handle, ok } from "@/lib/server/http";
import { listPools } from "@/lib/server/pools";
import { isWritable, memberCount, requireMember, toRoomInfo } from "@/lib/server/rooms";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Authoritative snapshot of a room: cards and pools with signed state. Clients
 * load this on entry and after reconnecting; live changes then arrive through
 * Nexconn (new messages and metadata updates), merged by version.
 */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const room = await requireMember(id, user.id);
  const [cards, pools, members] = await Promise.all([listCards(room.id, user.id), listPools(room.id, user.id), memberCount(room.id)]);
  return ok(
    { room: toRoomInfo(room), writable: isWritable(room), members, cards, pools, serverTime: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
});
