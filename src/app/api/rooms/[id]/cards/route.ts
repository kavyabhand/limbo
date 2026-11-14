import { newIntelSchema } from "@/lib/shared/cards";
import { postIntel } from "@/lib/server/cards";
import { handle, ok, parseBody } from "@/lib/server/http";
import { assertWritable, requireMember } from "@/lib/server/rooms";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Post a fact to the board. The server sends it as a Limbo:Intel message from the author, with signed state. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const room = await requireMember(id, user.id);
  assertWritable(room);
  const input = await parseBody(req, newIntelSchema);
  return ok({ card: await postIntel(room, user, input) }, { status: 201 });
});
