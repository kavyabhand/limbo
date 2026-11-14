/**
 * The custom-message protocol. Cards are Nexconn custom messages with a
 * versioned JSON payload; live state (votes, seats) rides on message metadata
 * that only the server writes, signed so clients can detect tampering.
 */
import { z } from "zod";

/** Custom message types registered with NCEngine.registerCustomMessages (≤ 32 chars, no RC:/NC: prefix). */
export const MSG = {
  intel: "Limbo:Intel",
  pool: "Limbo:Pool",
  notice: "Limbo:Notice",
} as const;
export type CardMessageType = (typeof MSG)[keyof typeof MSG];

export const INTEL_KINDS = ["delay", "cancel", "gate", "desk", "rebooking", "food", "refund", "safety", "other"] as const;
export type IntelKind = (typeof INTEL_KINDS)[number];

export const SOURCES = ["saw_myself", "staff", "announcement", "board", "app"] as const;
export type Source = (typeof SOURCES)[number];

export const POOL_KINDS = ["cab", "hotel", "meal"] as const;
export type PoolKind = (typeof POOL_KINDS)[number];

const MIN = 60_000;
const HOUR = 60 * MIN;

interface KindSpec {
  /** How long a card stays live before it expires. */
  lifetimeMs: number;
  /** Confidence half-life; facts about gates go stale faster than cancellations. */
  halfLifeMs: number;
  /** Multiplier on the confirmation thresholds (high-consequence claims need more). */
  bar: number;
  /** Whether an unconfirmed card of this kind can appear on the board at all. */
  boardWhenUnconfirmed: boolean;
  /** Whether a newer card of the same kind replaces an older one (by the same or another author). */
  supersedable: boolean;
}

export const KIND_SPEC: Record<IntelKind, KindSpec> = {
  delay: { lifetimeMs: 2 * HOUR, halfLifeMs: 45 * MIN, bar: 1, boardWhenUnconfirmed: true, supersedable: true },
  cancel: { lifetimeMs: 24 * HOUR, halfLifeMs: 6 * HOUR, bar: 1.5, boardWhenUnconfirmed: true, supersedable: false },
  gate: { lifetimeMs: 90 * MIN, halfLifeMs: 30 * MIN, bar: 1, boardWhenUnconfirmed: true, supersedable: true },
  desk: { lifetimeMs: 3 * HOUR, halfLifeMs: 60 * MIN, bar: 1, boardWhenUnconfirmed: true, supersedable: false },
  rebooking: { lifetimeMs: 24 * HOUR, halfLifeMs: 3 * HOUR, bar: 1.5, boardWhenUnconfirmed: false, supersedable: true },
  food: { lifetimeMs: 3 * HOUR, halfLifeMs: 90 * MIN, bar: 1, boardWhenUnconfirmed: true, supersedable: false },
  refund: { lifetimeMs: 24 * HOUR, halfLifeMs: 6 * HOUR, bar: 1.5, boardWhenUnconfirmed: false, supersedable: false },
  safety: { lifetimeMs: 4 * HOUR, halfLifeMs: 2 * HOUR, bar: 1, boardWhenUnconfirmed: true, supersedable: false },
  other: { lifetimeMs: 2 * HOUR, halfLifeMs: 45 * MIN, bar: 1.5, boardWhenUnconfirmed: false, supersedable: false },
};

export const LIMITS = {
  intelText: 140,
  intelDetail: 200,
  chatText: 1000,
  displayName: 32,
  poolPlace: 60,
  poolNote: 140,
  poolCapacity: { min: 2, max: 8 },
  poolCost: 1_000_000,
  delayMinutes: 48 * 60,
} as const;

/** Single-line, trimmed, no control characters. */
const line = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1).max(max));

export const displayNameSchema = line(LIMITS.displayName);

export const avatarColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);

export const authorSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
  name: z.string().min(1).max(LIMITS.displayName),
  color: avatarColorSchema,
});
export type Author = z.infer<typeof authorSchema>;

/* ----------------------------- Requests (client -> server) ----------------------------- */

export const newIntelSchema = z
  .object({
    kind: z.enum(INTEL_KINDS),
    text: line(LIMITS.intelText),
    detail: line(LIMITS.intelDetail).optional(),
    delayMinutes: z.number().int().min(0).max(LIMITS.delayMinutes).optional(),
    source: z.enum(SOURCES).optional(),
  })
  .refine((v) => v.kind !== "delay" || v.delayMinutes !== undefined, {
    message: "A delay card needs an estimate",
    path: ["delayMinutes"],
  });
export type NewIntel = z.infer<typeof newIntelSchema>;

export const newPoolSchema = z.object({
  kind: z.enum(POOL_KINDS),
  place: line(LIMITS.poolPlace),
  capacity: z.number().int().min(LIMITS.poolCapacity.min).max(LIMITS.poolCapacity.max),
  totalCost: z.number().int().min(0).max(LIMITS.poolCost).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("INR"),
  departsAt: z.number().int().positive().optional(),
  note: line(LIMITS.poolNote).optional(),
});
export type NewPool = z.infer<typeof newPoolSchema>;

export const voteSchema = z.object({ vote: z.enum(["confirm", "dispute", "none"]) });
export type VoteChoice = z.infer<typeof voteSchema>["vote"];

/* ----------------------------- Message payloads (on the wire) ----------------------------- */

export const intelContentSchema = z.object({
  v: z.literal(1),
  cardId: z.string().uuid(),
  kind: z.enum(INTEL_KINDS),
  text: z.string().max(LIMITS.intelText),
  detail: z.string().max(LIMITS.intelDetail).optional(),
  delayMinutes: z.number().int().optional(),
  source: z.enum(SOURCES).optional(),
  official: z.object({ org: z.string().max(64) }).optional(),
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
  supersedes: z.string().uuid().optional(),
  /** Author's language, so readers in other languages can auto-translate. */
  lang: z.string().max(8).optional(),
  author: authorSchema,
});
export type IntelContent = z.infer<typeof intelContentSchema>;

export const poolContentSchema = z.object({
  v: z.literal(1),
  poolId: z.string().uuid(),
  kind: z.enum(POOL_KINDS),
  place: z.string().max(LIMITS.poolPlace),
  capacity: z.number().int(),
  totalCost: z.number().int().optional(),
  currency: z.string(),
  departsAt: z.number().int().optional(),
  note: z.string().max(LIMITS.poolNote).optional(),
  createdAt: z.number().int(),
  organiser: authorSchema,
});
export type PoolContent = z.infer<typeof poolContentSchema>;

export const NOTICE_KINDS = ["pool_claimed", "pool_waitlisted", "pool_released", "pool_promoted", "pool_closed", "room_info"] as const;
export const noticeContentSchema = z.object({
  v: z.literal(1),
  kind: z.enum(NOTICE_KINDS),
  text: z.string().max(280),
  refId: z.string().optional(),
  createdAt: z.number().int(),
});
export type NoticeContent = z.infer<typeof noticeContentSchema>;

/* ----------------------------- Live state (signed metadata) ----------------------------- */

/** Metadata keys. Values are JSON strings; `sig` signs `${cardId or poolId}|${state}`. */
export const META = { state: "s", sig: "sig" } as const;

export const intelStateSchema = z.object({
  /** monotonically increasing version so late or out-of-order events are ignored */
  ver: z.number().int(),
  confirms: z.number().int().min(0),
  disputes: z.number().int().min(0),
  /** ms timestamp of the most recent confirmation (drives freshness and decay) */
  lastConfirmAt: z.number().int().nullable(),
  superseded: z.boolean(),
  removed: z.boolean(),
  /** Organisation name for verified-agent cards. Only trusted from signed state, never from content. */
  official: z.string().nullable(),
});
export type IntelState = z.infer<typeof intelStateSchema>;

export const POOL_STATUSES = ["open", "full", "done", "cancelled"] as const;
export type PoolStatus = (typeof POOL_STATUSES)[number];

export const poolStateSchema = z.object({
  ver: z.number().int(),
  status: z.enum(POOL_STATUSES),
  /** seat holders in claim order (organiser first) */
  members: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })),
  waitlist: z.number().int().min(0),
});
export type PoolState = z.infer<typeof poolStateSchema>;

export const initialIntelState = (official: string | null = null): IntelState => ({
  ver: 1,
  confirms: 0,
  disputes: 0,
  lastConfirmAt: null,
  superseded: false,
  removed: false,
  official,
});

/** Phone numbers and emails don't belong on the public board or on pool cards. */
export function looksLikeContactDetails(text: string): boolean {
  const digits = text.replace(/[\s().-]/g, "");
  return /\+?\d{10,13}/.test(digits) || /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text);
}

/** "≈ ₹350 each" — split across the seats taken so far (min 1). */
export function perPersonCost(totalCost: number | undefined, seatsTaken: number): number | null {
  if (totalCost === undefined || totalCost <= 0) return null;
  return Math.ceil(totalCost / Math.max(1, seatsTaken));
}

export function formatMoney(amount: number, currency: string, locale = "en-IN"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}
