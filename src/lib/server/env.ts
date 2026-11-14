import "server-only";
import { z } from "zod";

const schema = z.object({
  NEXCONN_APP_KEY: z.string().min(1),
  NEXCONN_APP_SECRET: z.string().min(1),
  /** Singapore data center by default; must match the App Key's data center. */
  NEXCONN_API_PRIMARY: z.string().default("api.sg-light-api.com"),
  NEXCONN_API_BACKUP: z.string().default("api-b.sg-light-api.com"),
  DATABASE_URL: z.string().url(),
  /** HMAC key for the guest session cookie. */
  SESSION_SECRET: z.string().min(32),
  /** Ed25519 private key (PKCS#8 DER, base64) used to sign live card state. */
  STATE_SIGNING_KEY: z.string().min(40),
  /** Shared secret for the private traction dashboard and admin endpoints. */
  ADMIN_KEY: z.string().min(16),
  APP_URL: z.string().url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Parsed lazily so `next build` works without secrets present. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${missing}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
