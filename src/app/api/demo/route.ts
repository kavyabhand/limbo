import { createDemo } from "@/lib/server/demo";
import { clientIp, handle, ok, rateLimit } from "@/lib/server/http";
import { toRoomInfo } from "@/lib/server/rooms";
import { ensureUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Start a fresh demo room for this visitor. */
export const POST = handle(async (req: Request) => {
  await rateLimit(`demo:${clientIp(req)}`, 30, 600);
  const { user } = await ensureUser();
  const room = await createDemo(user);
  return ok({ room: toRoomInfo(room) });
});
