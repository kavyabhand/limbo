import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { randomGuest } from "@/lib/shared/names";
import { pickLanguage } from "@/lib/shared/i18n";
import { db } from "./db";
import { env } from "./env";
import { HttpError } from "./http";

/**
 * No-signup identity. A guest gets a random user ID (also their Nexconn user ID)
 * held in an HMAC-signed, httpOnly cookie. Nothing personal is collected.
 */

const COOKIE = "limbo_sid";
const ONE_YEAR = 60 * 60 * 24 * 365;
const ID_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface User {
  id: string;
  display_name: string;
  avatar_color: string;
  language: string;
  is_agent: boolean;
  agent_org: string | null;
}

function newUserId(): string {
  // 20 chars from a 57-symbol alphabet ≈ 116 bits; letters and digits only (Nexconn requirement).
  const bytes = randomBytes(40);
  let id = "u";
  for (const b of bytes) {
    if (b < 228) id += ID_ALPHABET[b % 57]; // reject bytes ≥ 228 to avoid modulo bias
    if (id.length === 21) break;
  }
  return id.length === 21 ? id : newUserId();
}

function mac(id: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(id).digest("base64url");
}

function readCookieValue(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(mac(id));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return /^[A-Za-z0-9]{1,64}$/.test(id) ? id : null;
}

async function loadUser(id: string): Promise<User | null> {
  const rows = await db()<User[]>`
    update users set last_seen_at = now() where id = ${id}
    returning id, display_name, avatar_color, language, is_agent, agent_org`;
  return rows[0] ?? null;
}

/** The current guest, or null if this browser has no valid session. */
export async function currentUser(): Promise<User | null> {
  const id = readCookieValue((await cookies()).get(COOKIE)?.value);
  return id ? loadUser(id) : null;
}

/** The current guest, creating one (and setting the cookie) if needed. Route handlers only. */
export async function ensureUser(): Promise<{ user: User; created: boolean }> {
  const existing = await currentUser();
  if (existing) return { user: existing, created: false };

  const guest = randomGuest();
  const language = pickLanguage((await headers()).get("accept-language"));
  const id = newUserId();
  const [user] = await db()<User[]>`
    insert into users (id, display_name, avatar_color, language)
    values (${id}, ${guest.name}, ${guest.color}, ${language})
    returning id, display_name, avatar_color, language, is_agent, agent_org`;
  if (!user) throw new Error("Could not create guest");

  (await cookies()).set(COOKIE, `${id}.${mac(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: ONE_YEAR,
  });
  return { user, created: true };
}

/** For API routes that need an existing guest (everything except session start and join). */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "no_session", "Your session expired. Reload the page to continue.");
  return user;
}
