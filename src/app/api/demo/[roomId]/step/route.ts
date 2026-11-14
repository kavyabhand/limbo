import { z } from "zod";
import { DEMO_SCHEDULE, runDemoStep } from "@/lib/server/demo";
import { handle, ok, parseBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const body = z.object({ step: z.number().int().min(1).max(DEMO_SCHEDULE.length - 1) });

/** Advance the scripted demo by one step. Idempotent and ordered. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ roomId: string }> }) => {
  const { roomId } = await ctx.params;
  const user = await requireUser();
  const { step } = await parseBody(req, body);
  return ok(await runDemoStep(roomId, user, step));
});

export const GET = handle(async () => ok({ schedule: DEMO_SCHEDULE }));
