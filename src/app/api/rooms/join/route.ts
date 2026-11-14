import { z } from "zod";
import { checkCode, isDateInWindow, TRIP_MODES } from "@/lib/shared/trip";
import { HttpError, handle, ok, parseBody, rateLimit, track } from "@/lib/server/http";
import { ensureMembership, getOrCreateRoom, toRoomInfo } from "@/lib/server/rooms";
import { ensureUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const body = z.object({
  mode: z.enum(TRIP_MODES),
  code: z.string().max(40),
  date: z.string(),
  /** Set when the user confirmed "create the room anyway" for an unusual code. */
  force: z.boolean().optional(),
});

/** Enter the room for a trip. The room is created the first time anyone asks for it. */
export const POST = handle(async (req: Request) => {
  const input = await parseBody(req, body);
  const { user } = await ensureUser();
  await rateLimit(`join:${user.id}`, 20, 60);

  const check = checkCode(input.mode, input.code);
  if (!check.ok) {
    const msg = check.reason === "empty" ? "Enter your trip number." : "That doesn't look like a trip number. Check the format.";
    throw new HttpError(400, `code_${check.reason}`, msg);
  }
  if (!check.recognised && !input.force) {
    // Not an error: the UI asks the user to confirm before creating an unusual room.
    return ok({ needsConfirm: true, code: check.code });
  }
  if (!isDateInWindow(input.date, Date.now())) {
    throw new HttpError(400, "date_range", "Rooms open for trips from 3 days ago up to 2 months ahead.");
  }

  const room = await getOrCreateRoom({ mode: input.mode, code: check.code, date: input.date }, user.id);
  const { firstVisit } = await ensureMembership(room, user.id);
  if (firstVisit) void track("room_joined", user.id, room.id, { mode: room.mode, demo: room.is_demo });
  return ok({ room: toRoomInfo(room) });
});
