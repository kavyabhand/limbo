import { test } from "node:test";
import assert from "node:assert/strict";
import { delayWords, deriveBoard, formatDelay, type CardView } from "./board.ts";
import { initialIntelState, type IntelContent, type IntelState } from "./cards.ts";

const MIN = 60_000;
const now = 1_800_000_000_000;
let n = 0;
function card(kind: IntelContent["kind"], text: string, state: Partial<IntelState> = {}, extra: Partial<IntelContent> = {}): CardView {
  n += 1;
  return {
    content: {
      v: 1,
      cardId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      kind,
      text,
      createdAt: now - 10 * MIN,
      expiresAt: now + 60 * MIN,
      author: { id: `u${n}`, name: "T", color: "#1d6fa5" },
      ...extra,
    },
    state: { ...initialIntelState(), ...state },
  };
}

test("formatDelay", () => {
  assert.equal(formatDelay(25), "~25 min");
  assert.equal(formatDelay(60), "~1h");
  assert.equal(formatDelay(100), "~1.5h");
  assert.equal(formatDelay(180), "~3h");
  assert.equal(delayWords(45), "about 45 minutes");
  assert.equal(delayWords(60), "about 1 hour");
  assert.equal(delayWords(100), "about 1.5 hours");
});

test("empty room says so honestly", () => {
  const b = deriveBoard([], 3, now);
  assert.equal(b.status.headline, "No updates yet");
  assert.equal(b.facts.length, 0);
});

test("a delay report drives the status line, marked as reported until confirmed", () => {
  const b = deriveBoard([card("delay", "2 hours late", {}, { delayMinutes: 120 })], 30, now);
  assert.equal(b.status.headline, "Delayed about 2 hours");
  assert.equal(b.status.basis, "reported");
  const c = deriveBoard([card("delay", "2 hours late", { confirms: 5, lastConfirmAt: now }, { delayMinutes: 120 })], 30, now);
  assert.equal(c.status.basis, "confirmed");
});

test("a confirmed cancellation outranks delays and picks up the rebooking desk", () => {
  const b = deriveBoard(
    [
      card("delay", "late", { confirms: 9, lastConfirmAt: now }, { delayMinutes: 120 }),
      card("cancel", "Cancelled", { confirms: 8, lastConfirmAt: now }),
      card("desk", "Rebooking desk at Gate 12", { confirms: 5, lastConfirmAt: now }),
    ],
    30,
    now,
  );
  assert.equal(b.status.tone, "cancelled");
  assert.equal(b.status.headline, "Cancelled");
  assert.equal(b.status.detail, "Rebooking desk at Gate 12");
});

test("official cards are separated and the status trusts them", () => {
  const b = deriveBoard([card("cancel", "AI101 cancelled", { official: "Air India" })], 30, now);
  assert.equal(b.official.length, 1);
  assert.equal(b.status.basis, "official");
  assert.equal(b.status.org, "Air India");
});

test("superseded and expired cards never reach the board", () => {
  const b = deriveBoard(
    [
      card("gate", "Gate 4", { superseded: true }),
      card("food", "Tea stall", {}, { expiresAt: now - 1 }),
      card("other", "rumour"),
    ],
    30,
    now,
  );
  assert.equal(b.facts.length, 0);
  assert.equal(b.offBoard, 1); // the unconfirmed "other" card is live but off the board
});
