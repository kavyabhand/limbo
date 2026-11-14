import { voteSchema } from "@/lib/shared/cards";
import { vote } from "@/lib/server/cards";
import { HttpError, handle, ok, parseBody } from "@/lib/server/http";
import { assertWritable, requireMember } from "@/lib/server/rooms";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string; cardId: string }> }) => {
  const { id, cardId } = await ctx.params;
  if (!UUID.test(cardId)) throw new HttpError(404, "no_card", "That update no longer exists.");
  const user = await requireUser();
  const room = await requireMember(id, user.id);
  assertWritable(room);
  const { vote: choice } = await parseBody(req, voteSchema);
  return ok({ card: await vote(room, user, cardId, choice) });
});
