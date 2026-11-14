import { test } from "node:test";
import assert from "node:assert/strict";
import {
  channelIdFor,
  checkCode,
  displayCode,
  displayDate,
  isDateInWindow,
  isValidDate,
  normaliseCode,
  parseSlug,
  roomKey,
  roomSlug,
} from "./trip.ts";

test("normaliseCode strips spaces, dashes and case", () => {
  assert.equal(normaliseCode(" ai-101 "), "AI101");
  assert.equal(normaliseCode("6e 2134"), "6E2134");
  assert.equal(normaliseCode("KSRTC/MYS 2230"), "KSRTCMYS2230");
});

test("flight codes", () => {
  assert.deepEqual(checkCode("flight", "AI 101"), { ok: true, code: "AI101", recognised: true });
  assert.deepEqual(checkCode("flight", "6E2134"), { ok: true, code: "6E2134", recognised: true });
  assert.deepEqual(checkCode("flight", "AIC101"), { ok: true, code: "AIC101", recognised: true });
  assert.deepEqual(checkCode("flight", "BA9A"), { ok: true, code: "BA9A", recognised: true });
  // All-digit "designator" is not a flight number, but still a usable room.
  assert.deepEqual(checkCode("flight", "12345"), { ok: true, code: "12345", recognised: false });
  assert.deepEqual(checkCode("flight", "  "), { ok: false, reason: "empty" });
  assert.deepEqual(checkCode("flight", "A1"), { ok: false, reason: "format" });
  assert.deepEqual(checkCode("flight", "X".repeat(25)), { ok: false, reason: "too_long" });
});

test("train and bus codes", () => {
  assert.deepEqual(checkCode("train", "12627"), { ok: true, code: "12627", recognised: true });
  assert.deepEqual(checkCode("train", "ICE 578"), { ok: true, code: "ICE578", recognised: false });
  assert.deepEqual(checkCode("bus", "KSRTC-MYS-2230"), { ok: true, code: "KSRTCMYS2230", recognised: true });
  assert.deepEqual(checkCode("bus", "ab"), { ok: false, reason: "format" });
});

test("dates", () => {
  assert.equal(isValidDate("2026-12-14"), true);
  assert.equal(isValidDate("2026-02-30"), false);
  assert.equal(isValidDate("2026-2-3"), false);
  const now = Date.UTC(2026, 10, 13, 12);
  assert.equal(isDateInWindow("2026-11-13", now), true);
  assert.equal(isDateInWindow("2026-11-09", now), true); // 4 days back incl. slack
  assert.equal(isDateInWindow("2026-11-08", now), false);
  assert.equal(isDateInWindow("2027-01-13", now), true);
  assert.equal(isDateInWindow("2027-01-14", now), false);
  assert.equal(displayDate("2026-12-14", now), "14 Dec");
  assert.equal(displayDate("2027-01-02", now), "2 Jan 2027");
});

test("keys, slugs and channel ids round-trip", () => {
  const trip = { mode: "flight", code: "AI101", date: "2026-12-14" } as const;
  assert.equal(roomKey(trip), "flight:AI101:2026-12-14");
  assert.equal(roomSlug(trip), "flight-AI101-2026-12-14");
  assert.deepEqual(parseSlug(roomSlug(trip)), trip);
  assert.deepEqual(parseSlug("flight-ai101-2026-12-14"), trip);
  assert.equal(parseSlug("plane-AI101-2026-12-14"), null);
  assert.equal(parseSlug("flight-AI101-2026-13-01"), null);
  assert.equal(parseSlug("flight-AI101-2026-12-14/../x"), null);
  const id = channelIdFor(trip);
  assert.equal(id, "lbfAI10120261214");
  assert.match(id, /^[A-Za-z0-9]{1,64}$/);
  assert.equal(displayCode(trip), "AI 101");
  assert.equal(displayCode({ mode: "train", code: "12627" }), "12627");
});
