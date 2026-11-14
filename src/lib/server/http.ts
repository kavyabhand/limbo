import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { db } from "./db";
import { NexconnError } from "./nexconn";

/** Errors that are safe to show to the user. Anything else becomes a generic 500. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const ok = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  // JSON only: browsers cannot send this cross-site without a CORS preflight, which we never grant.
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "json_only", "The request body must be JSON.");
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "bad_json", "The request body must be JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, "invalid", first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request.");
  }
  return parsed.data;
}

/** Wrap a route handler: consistent JSON errors, no stack traces or message content in logs. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
      }
      if (err instanceof NexconnError) {
        console.error(`[nexconn] ${err.path} http=${err.httpStatus} code=${err.code}`);
        return NextResponse.json(
          { error: { code: "chat_unavailable", message: "Couldn't reach the chat service. Try again in a moment." } },
          { status: 502 },
        );
      }
      console.error("[api] unhandled", err instanceof Error ? `${err.name}: ${err.message}` : err);
      return NextResponse.json({ error: { code: "server", message: "Something went wrong on our side." } }, { status: 500 });
    }
  };
}

/** Simulated demo travellers ("sim…") are shared by every demo run, so they are never rate limited. Real guest IDs start with "u". */
export function isSimulatedUser(id: string): boolean {
  return id.startsWith("sim");
}

/**
 * Fixed-window rate limit stored in Postgres, so it holds across serverless
 * instances. Throws 429 when the bucket is over its limit.
 */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<void> {
  const subject = bucket.slice(bucket.indexOf(":") + 1);
  if (isSimulatedUser(subject)) return;
  const [row] = await db()<{ hits: number }[]>`
    insert into rate_limits (bucket, window_start, hits) values (${bucket}, now(), 1)
    on conflict (bucket) do update set
      hits = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.hits + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning hits`;
  // Occasionally prune expired buckets so the table stays small.
  if (Math.random() < 0.01) void db()`delete from rate_limits where window_start < now() - interval '1 day'`.catch(() => {});
  if (row && row.hits > limit) {
    throw new HttpError(429, "slow_down", "Too many tries. Wait a moment and try again.");
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Fire-and-forget analytics event. Never throws. */
export async function track(name: string, userId: string | null, roomId: string | null, props: object = {}): Promise<void> {
  try {
    await db()`insert into events (name, user_id, room_id, props) values (${name}, ${userId}, ${roomId}, ${db().json(props as never)})`;
  } catch {
    /* analytics must never break a request */
  }
}
