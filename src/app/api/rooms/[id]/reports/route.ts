import { z } from "zod";
import { db } from "@/lib/server/db";
import { handle, ok, parseBody, rateLimit, track } from "@/lib/server/http";
import { requireMember } from "@/lib/server/rooms";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const body = z.object({
  targetType: z.enum(["message", "card", "pool", "user"]),
  targetId: z.string().min(1).max(80),
  reason: z.enum(["false_info", "scam", "abuse", "spam", "personal_info", "other"]),
});

/** One report per person per target; reports feed the moderation list on the admin dashboard. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const room = await requireMember(id, user.id);
  await rateLimit(`report:${user.id}`, 10, 600);
  const input = await parseBody(req, body);
  await db()`
    insert into reports (room_id, reporter_id, target_type, target_id, reason)
    values (${room.id}, ${user.id}, ${input.targetType}, ${input.targetId}, ${input.reason})
    on conflict (reporter_id, target_type, target_id) do update set reason = excluded.reason`;
  void track("report", user.id, room.id, { reason: input.reason });
  return ok({ ok: true });
});
