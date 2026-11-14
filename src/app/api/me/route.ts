import { z } from "zod";
import { avatarColorSchema, displayNameSchema } from "@/lib/shared/cards";
import { LANGUAGES } from "@/lib/shared/i18n";
import { db } from "@/lib/server/db";
import { handle, ok, parseBody, rateLimit } from "@/lib/server/http";
import { updateUser } from "@/lib/server/nexconn";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const body = z
  .object({
    name: displayNameSchema.optional(),
    color: avatarColorSchema.optional(),
    language: z.enum(LANGUAGES.map((l) => l.code) as [string, ...string[]]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

/** Rename yourself or change your language. */
export const PATCH = handle(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(`me:${user.id}`, 20, 600);
  const input = await parseBody(req, body);
  const [row] = await db()<{ display_name: string; avatar_color: string; language: string }[]>`
    update users set
      display_name = coalesce(${input.name ?? null}, display_name),
      avatar_color = coalesce(${input.color ?? null}, avatar_color),
      language = coalesce(${input.language ?? null}, language)
    where id = ${user.id}
    returning display_name, avatar_color, language`;
  if (input.name && input.name !== user.display_name) {
    // Keeps push notification names in sync; not critical if it fails.
    await updateUser(user.id, input.name).catch(() => {});
  }
  return ok({ user: { id: user.id, name: row?.display_name, color: row?.avatar_color, language: row?.language } });
});
