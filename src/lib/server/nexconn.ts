import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { env } from "./env";

/**
 * Minimal, typed client for the Nexconn Platform Chat API.
 *
 * - Signs every request: Signature = sha1(AppSecret + Nonce + Timestamp).
 * - Fails over to the backup domain on network errors, timeouts and 5xx,
 *   as the docs recommend for high availability.
 * - Treats a non-zero business `code` as an error.
 */

export class NexconnError extends Error {
  constructor(
    readonly path: string,
    readonly httpStatus: number,
    readonly code: number | null,
    detail: string,
  ) {
    super(`Nexconn ${path} failed (http ${httpStatus}, code ${code ?? "n/a"}): ${detail}`);
    this.name = "NexconnError";
  }
}

const TIMEOUT_MS = 6_000;

// Remember which domain worked last so a failing primary is not retried first every time.
let preferBackupUntil = 0;

function signHeaders(): Record<string, string> {
  const { NEXCONN_APP_KEY, NEXCONN_APP_SECRET } = env();
  // Nonce must be ≤ 18 characters.
  const nonce = BigInt(`0x${randomBytes(7).toString("hex")}`).toString();
  const timestamp = String(Date.now());
  const signature = createHash("sha1").update(NEXCONN_APP_SECRET + nonce + timestamp, "utf8").digest("hex");
  return {
    "App-Key": NEXCONN_APP_KEY,
    Nonce: nonce,
    Timestamp: timestamp,
    Signature: signature,
    "X-Request-ID": randomUUID(),
    "Content-Type": "application/json",
  };
}

type Retryable = { retry: true; error: Error } | { retry: false; error: Error };

async function attempt<T>(host: string, path: string, body: unknown): Promise<T | Retryable> {
  let res: Response;
  try {
    res = await fetch(`https://${host}${path}`, {
      method: "POST",
      headers: signHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    return { retry: true, error: new NexconnError(path, 0, null, (err as Error).message) };
  }
  const text = await res.text();
  let json: { code?: number; msg?: string; errorMessage?: string; result?: unknown } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON body: handled below */
  }
  const detail = json.msg ?? json.errorMessage ?? text.slice(0, 200);
  if (res.status >= 500) return { retry: true, error: new NexconnError(path, res.status, json.code ?? null, detail) };
  if (!res.ok || (json.code !== undefined && json.code !== 0 && json.code !== 200)) {
    return { retry: false, error: new NexconnError(path, res.status, json.code ?? null, detail) };
  }
  return json as T;
}

function isFailure(v: unknown): v is Retryable {
  return typeof v === "object" && v !== null && "retry" in v && "error" in v;
}

export async function call<T = { code: number }>(path: string, body: unknown): Promise<T> {
  const { NEXCONN_API_PRIMARY, NEXCONN_API_BACKUP } = env();
  const [first, second] =
    Date.now() < preferBackupUntil ? [NEXCONN_API_BACKUP, NEXCONN_API_PRIMARY] : [NEXCONN_API_PRIMARY, NEXCONN_API_BACKUP];
  // First domain, the other domain, then the first again after a short pause: transient network blips do happen.
  // Repeats are safe: clients de-duplicate cards and pools by ID, and metadata, join and create calls are idempotent.
  const hosts = [first, second, first];
  let last: Error | null = null;
  for (const [i, host] of hosts.entries()) {
    if (i === 2) await new Promise((r) => setTimeout(r, 400));
    const out = await attempt<T>(host, path, body);
    if (!isFailure(out)) {
      if (i === 1) preferBackupUntil = host === NEXCONN_API_BACKUP ? Date.now() + 60_000 : 0;
      return out;
    }
    last = out.error;
    if (!out.retry) break;
  }
  throw last ?? new Error(`Nexconn ${path} failed`);
}

/* ------------------------------------ Users ------------------------------------ */

export async function issueAccessToken(userId: string, name: string): Promise<string> {
  const res = await call<{ result: { accessToken: string } }>("/v4/auth/access-token/issue", { userId, name });
  return res.result.accessToken;
}

export async function updateUser(userId: string, name: string): Promise<void> {
  await call("/v4/user/update", { userId, name });
}

/* ------------------------------- Community channels ------------------------------- */

/** Trip rooms. Messages without a subchannel go to the default subchannel "RCDefault". */
export const DEFAULT_SUBCHANNEL = "RCDefault";

export async function createCommunityChannel(channelId: string, name: string, firstUserId: string): Promise<void> {
  await call("/v4/community-channel/create", { channelId, name: name.slice(0, 64), userId: firstUserId });
}

export async function joinCommunityChannel(channelId: string, userId: string): Promise<void> {
  await call("/v4/community-channel/join", { channelId, userId });
}

export interface SendResult {
  messageId: string;
}

function firstMessageId(res: { result?: { messageIds?: { channelId: string; messageId: string }[] } }, path: string): string {
  const id = res.result?.messageIds?.[0]?.messageId;
  if (!id) throw new NexconnError(path, 200, 0, "send succeeded but returned no messageId");
  return id;
}

export async function sendCommunityMessage(opts: {
  channelId: string;
  fromUserId: string;
  messageType: string;
  content: unknown;
  metadata?: Record<string, string>;
  pushContent?: string;
  counted?: boolean;
}): Promise<SendResult> {
  const path = "/v4/community-channel/message/send";
  const res = await call<{ result?: { messageIds?: { channelId: string; messageId: string }[] } }>(path, {
    fromUserId: opts.fromUserId,
    toChannelIds: [opts.channelId],
    messageType: opts.messageType,
    content: JSON.stringify(opts.content),
    subchannelId: DEFAULT_SUBCHANNEL,
    shouldPersist: 1,
    isCounted: opts.counted === false ? 0 : 1,
    ...(opts.pushContent ? { pushContent: opts.pushContent } : {}),
    ...(opts.metadata ? { hasMetadata: true, metadata: opts.metadata } : {}),
  });
  return { messageId: firstMessageId(res, path) };
}

export async function setCommunityMessageMetadata(opts: {
  channelId: string;
  messageId: string;
  operatorUserId: string;
  metadata: Record<string, string>;
}): Promise<void> {
  await call("/v4/community-channel/message/metadata/set", {
    channelId: opts.channelId,
    subchannelId: DEFAULT_SUBCHANNEL,
    messageId: opts.messageId,
    userId: opts.operatorUserId,
    metadata: opts.metadata,
  });
}

/* --------------------------------- Group channels --------------------------------- */

/** Private pool chats. */
export async function createGroupChannel(channelId: string, name: string, owner: string, userIds: string[]): Promise<void> {
  await call("/v4/group-channel/create", {
    channelId,
    name: name.slice(0, 64),
    owner,
    userIds: userIds.filter((u) => u !== owner).slice(0, 30),
    // Nobody can join except through the server (claiming a seat).
    permissions: { joinPerm: 3, memInvitePerm: 0, profilePerm: 0 },
  });
}

export async function joinGroupChannel(channelId: string, userIds: string[]): Promise<void> {
  await call("/v4/group-channel/join", { channelId, userIds });
}

export async function leaveGroupChannel(channelId: string, userIds: string[]): Promise<void> {
  await call("/v4/group-channel/leave", { channelId, userIds });
}

export async function sendGroupMessage(opts: {
  channelId: string;
  fromUserId: string;
  messageType: string;
  content: unknown;
}): Promise<SendResult> {
  const path = "/v4/group-channel/message/send";
  const res = await call<{ result?: { messageIds?: { channelId: string; messageId: string }[] } }>(path, {
    fromUserId: opts.fromUserId,
    toChannelIds: [opts.channelId],
    messageType: opts.messageType,
    content: JSON.stringify(opts.content),
    shouldPersist: 1,
    isEchoToSender: 1,
  });
  return { messageId: firstMessageId(res, path) };
}
