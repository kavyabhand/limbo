import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** Constant-time check of the admin key (hash first so lengths always match). */
export function isAdminKey(given: string | null | undefined): boolean {
  if (!given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(env().ADMIN_KEY).digest();
  return timingSafeEqual(a, b);
}
