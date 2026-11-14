import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, compareForBoard, isContested, thresholds } from "./confidence.ts";
import { initialIntelState, type IntelState } from "./cards.ts";

const MIN = 60_000;
const now = 1_800_000_000_000;
const card = (over: Partial<Parameters<typeof assess>[0]> = {}) => ({
  kind: "desk" as const,
  official: false,
  createdAt: now - 5 * MIN,
  expiresAt: now + 60 * MIN,
  ...over,
});
const state = (over: Partial<IntelState> = {}): IntelState => ({ ...initialIntelState(), ...over });

test("thresholds scale with room size and kind", () => {
  assert.deepEqual(thresholds(3, "desk"), { likely: 1, confirmed: 2 });
  assert.deepEqual(thresholds(20, "desk"), { likely: 1.5, confirmed: 3 });
  assert.deepEqual(thresholds(200, "desk"), { likely: 1.5, confirmed: 4 });
  assert.deepEqual(thresholds(200, "cancel"), { likely: 2.25, confirmed: 6 });
});

test("a fresh unconfirmed desk report shows on the board, marked unconfirmed", () => {
  const a = assess(card(), state(), 30, now);
  assert.equal(a.status, "unconfirmed");
  assert.equal(a.onBoard, true);
});

test("an unconfirmed 'other' report stays off the board", () => {
  const a = assess(card({ kind: "other" }), state(), 30, now);
  assert.equal(a.onBoard, false);
});

test("confirmations promote a card", () => {
  assert.equal(assess(card(), state({ confirms: 2, lastConfirmAt: now }), 30, now).status, "likely");
  assert.equal(assess(card(), state({ confirms: 4, lastConfirmAt: now }), 30, now).status, "confirmed");
  assert.equal(assess(card(), state({ confirms: 2, lastConfirmAt: now }), 4, now).status, "confirmed");
});

test("confidence decays without fresh confirmations", () => {
  const fresh = assess(card(), state({ confirms: 4, lastConfirmAt: now }), 30, now);
  const stale = assess(card(), state({ confirms: 4, lastConfirmAt: now - 120 * MIN }), 30, now);
  assert.equal(fresh.status, "confirmed");
  assert.ok(stale.score < fresh.score / 3);
  assert.notEqual(stale.status, "confirmed");
});

test("disputes create a contested card", () => {
  // Big rooms need at least 5 votes before a card can be contested.
  assert.equal(isContested({ confirms: 3, disputes: 2 }, 30), true); // 5 votes, 2 > 0.6 × 3
  assert.equal(isContested({ confirms: 1, disputes: 2 }, 30), false); // only 3 votes
  // Small rooms need 3.
  assert.equal(isContested({ confirms: 1, disputes: 2 }, 10), true);
  assert.equal(isContested({ confirms: 4, disputes: 2 }, 10), false); // 2 ≤ 0.6 × 4
  assert.equal(isContested({ confirms: 1, disputes: 1 }, 10), false);
  const a = assess(card(), state({ confirms: 2, disputes: 2, lastConfirmAt: now }), 10, now);
  assert.equal(a.status, "contested");
  assert.equal(a.onBoard, true);
});

test("official, superseded and expired", () => {
  assert.equal(assess(card({ official: true }), state(), 30, now).status, "official");
  assert.equal(assess(card({ official: true }), state({ superseded: true }), 30, now).status, "superseded");
  assert.equal(assess(card({ expiresAt: now - 1 }), state({ confirms: 9 }), 30, now).status, "expired");
  assert.equal(assess(card(), state({ removed: true }), 30, now).onBoard, false);
});

test("board ordering puts official first", () => {
  const items = [
    { createdAt: 1, assessment: assess(card(), state({ confirms: 9, lastConfirmAt: now }), 30, now) },
    { createdAt: 2, assessment: assess(card({ official: true }), state(), 30, now) },
    { createdAt: 3, assessment: assess(card(), state(), 30, now) },
  ].sort(compareForBoard);
  assert.deepEqual(items.map((i) => i.assessment.status), ["official", "confirmed", "unconfirmed"]);
});
