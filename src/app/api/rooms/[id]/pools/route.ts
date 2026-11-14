import { newPoolSchema } from "@/lib/shared/cards";
import { handle, ok, parseBody } from "@/lib/server/http";
import { createPool } from "@/lib/server/pools";
import { assertWritable, requireMember } from "@/lib/server/rooms";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const room = await requireMember(id, user.id);
  assertWritable(room);
  const input = await parseBody(req, newPoolSchema);
  return ok({ pool: await createPool(room, user, input) }, { status: 201 });
});
