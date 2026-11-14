/**
 * Trip identity. A trip (mode + code + date) is a public, shared identifier,
 * which is what lets a room exist before anyone joins it.
 *
 * Everything here is pure and runs on both server and client.
 */

export const TRIP_MODES = ["flight", "train", "bus"] as const;
export type TripMode = (typeof TRIP_MODES)[number];

export interface Trip {
  mode: TripMode;
  /** Canonical code: uppercase letters and digits only, e.g. "AI101", "12627". */
  code: string;
  /** Local travel date, YYYY-MM-DD. */
  date: string;
}

export type CodeCheck =
  | { ok: true; code: string; recognised: boolean }
  | { ok: false; reason: "empty" | "too_long" | "format" };

const MODE_LETTER: Record<TripMode, string> = { flight: "f", train: "t", bus: "b" };
const MAX_CODE = 24;

export function isTripMode(value: unknown): value is TripMode {
  return typeof value === "string" && (TRIP_MODES as readonly string[]).includes(value);
}

/** Uppercase and drop anything that is not a letter or digit ("ai-101 " -> "AI101"). */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// IATA designator (2 chars, at least one letter, e.g. "AI", "6E") or ICAO (3 letters),
// then a 1–4 digit flight number with an optional operational suffix letter.
const FLIGHT_RE = /^([A-Z]{3}|[A-Z0-9]{2})(\d{1,4}[A-Z]?)$/;

function splitFlight(code: string): [string, string] | null {
  const m = FLIGHT_RE.exec(code);
  const designator = m?.[1];
  const number = m?.[2];
  if (!designator || !number) return null;
  if (!/[A-Z]/.test(designator)) return null; // "12345" is not a flight
  return [designator, number];
}

/**
 * Validate a code for a mode. Unusual-but-plausible codes are allowed with
 * `recognised: false` so the UI can offer "create the room anyway".
 */
export function checkCode(mode: TripMode, raw: string): CodeCheck {
  const code = normaliseCode(raw);
  if (!code) return { ok: false, reason: "empty" };
  if (code.length > MAX_CODE) return { ok: false, reason: "too_long" };
  switch (mode) {
    case "flight":
      if (splitFlight(code)) return { ok: true, code, recognised: true };
      return code.length >= 3 ? { ok: true, code, recognised: false } : { ok: false, reason: "format" };
    case "train":
      if (/^\d{5}$/.test(code)) return { ok: true, code, recognised: true }; // Indian Railways train number
      return code.length >= 2 ? { ok: true, code, recognised: false } : { ok: false, reason: "format" };
    case "bus":
      return code.length >= 3 ? { ok: true, code, recognised: true } : { ok: false, reason: "format" };
  }
}

/** Strict calendar check for YYYY-MM-DD. */
export function isValidDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Days between two YYYY-MM-DD dates (b - a). */
export function dayDiff(a: string, b: string): number {
  const toUtc = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function utcDateString(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Rooms can be opened for trips from a few days ago up to two months ahead. */
export const DATE_WINDOW = { pastDays: 3, futureDays: 60 } as const;

export function isDateInWindow(date: string, now: number): boolean {
  if (!isValidDate(date)) return false;
  const diff = dayDiff(utcDateString(now), date);
  // ±1 day of slack for time zones on either side of UTC.
  return diff >= -(DATE_WINDOW.pastDays + 1) && diff <= DATE_WINDOW.futureDays + 1;
}

export function roomKey(trip: Trip): string {
  return `${trip.mode}:${trip.code}:${trip.date}`;
}

/** URL slug: /r/flight-AI101-2026-12-14 */
export function roomSlug(trip: Trip): string {
  return `${trip.mode}-${trip.code}-${trip.date}`;
}

export function parseSlug(slug: string): Trip | null {
  const m = /^(flight|train|bus)-([A-Za-z0-9]{1,24})-(\d{4}-\d{2}-\d{2})$/.exec(slug);
  const [mode, rawCode, date] = [m?.[1], m?.[2], m?.[3]];
  if (!isTripMode(mode) || !rawCode || !date || !isValidDate(date)) return null;
  const check = checkCode(mode, rawCode);
  if (!check.ok) return null;
  return { mode, code: check.code, date };
}

/**
 * Nexconn community channel ID. The API allows letters and digits, max 64 chars.
 * Shape: "lb" + mode letter + code + yyyymmdd (≤ 35 chars).
 */
export function channelIdFor(trip: Trip): string {
  return `lb${MODE_LETTER[trip.mode]}${trip.code}${trip.date.replace(/-/g, "")}`;
}

/** Human-friendly code: "AI101" -> "AI 101". */
export function displayCode(trip: Pick<Trip, "mode" | "code">): string {
  if (trip.mode === "flight") {
    const parts = splitFlight(trip.code);
    if (parts) return `${parts[0]} ${parts[1]}`;
  }
  return trip.code;
}

/** "14 Dec" (or "14 Dec 2027" when not this year). Uses UTC so it never shifts a day. */
export function displayDate(date: string, now: number, locale = "en-GB"): string {
  if (!isValidDate(date)) return date;
  const d = new Date(`${date}T00:00:00Z`);
  const sameYear = d.getUTCFullYear() === new Date(now).getUTCFullYear();
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

export function tripLabel(trip: Trip, now: number, locale?: string): string {
  return `${displayCode(trip)} · ${displayDate(trip.date, now, locale)}`;
}
