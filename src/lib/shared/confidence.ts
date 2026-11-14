/**
 * Confidence scoring for crowd-reported facts. Deliberately simple and
 * explainable: every number here can be described in one sentence to a judge
 * or a traveller.
 *
 *   raw        = confirmations − 1.25 × disputes
 *   decay      = 0.5 ^ (minutes since last confirmation / half-life)
 *   confidence = max(0, raw × decay)
 *
 * The thresholds scale with the number of people in the room, so a room of
 * three is not stuck with an empty board.
 */
import { KIND_SPEC, type IntelKind, type IntelState } from "./cards.ts";

export type CardStatus = "official" | "confirmed" | "likely" | "unconfirmed" | "contested" | "superseded" | "expired";

export interface CardAssessment {
  status: CardStatus;
  /** 0..1 for the confidence bar */
  strength: number;
  score: number;
  /** whether the card belongs on the board above the chat */
  onBoard: boolean;
}

export interface CardFacts {
  kind: IntelKind;
  official: boolean;
  createdAt: number;
  expiresAt: number;
}

export const DISPUTE_WEIGHT = 1.25;

export function thresholds(roomSize: number, kind: IntelKind): { likely: number; confirmed: number } {
  const base = roomSize <= 5 ? { likely: 1, confirmed: 2 } : roomSize <= 25 ? { likely: 1.5, confirmed: 3 } : { likely: 1.5, confirmed: 4 };
  const bar = KIND_SPEC[kind].bar;
  return { likely: base.likely * bar, confirmed: base.confirmed * bar };
}

export function isContested(state: Pick<IntelState, "confirms" | "disputes">, roomSize: number): boolean {
  const total = state.confirms + state.disputes;
  const minVotes = roomSize <= 25 ? 3 : 5;
  return total >= minVotes && state.disputes > state.confirms * 0.6;
}

export function assess(card: CardFacts, state: IntelState, roomSize: number, now: number): CardAssessment {
  if (state.removed || now >= card.expiresAt) return { status: "expired", strength: 0, score: 0, onBoard: false };
  if (state.superseded) return { status: "superseded", strength: 0, score: 0, onBoard: false };
  if (card.official) return { status: "official", strength: 1, score: Infinity, onBoard: true };

  const spec = KIND_SPEC[card.kind];
  const raw = state.confirms - DISPUTE_WEIGHT * state.disputes;
  const since = Math.max(0, now - (state.lastConfirmAt ?? card.createdAt));
  const decay = Math.pow(0.5, since / spec.halfLifeMs);
  const score = Math.max(0, raw * decay);
  const t = thresholds(roomSize, card.kind);
  const strength = Math.min(1, score / t.confirmed);

  if (isContested(state, roomSize)) return { status: "contested", strength, score, onBoard: true };
  if (score >= t.confirmed) return { status: "confirmed", strength, score, onBoard: true };
  if (score >= t.likely) return { status: "likely", strength, score, onBoard: true };
  // Fresh, undisputed reports can show on the board (clearly marked) for kinds where
  // early warning matters more than certainty, e.g. "gate changed".
  const fresh = since < spec.halfLifeMs / 2 && state.disputes === 0;
  return { status: "unconfirmed", strength, score, onBoard: spec.boardWhenUnconfirmed && fresh };
}

const STATUS_RANK: Record<CardStatus, number> = {
  official: 0,
  confirmed: 1,
  contested: 2,
  likely: 3,
  unconfirmed: 4,
  superseded: 5,
  expired: 6,
};

/** Board order: official first, then by status, then by score, then newest. */
export function compareForBoard(
  a: { assessment: CardAssessment; createdAt: number },
  b: { assessment: CardAssessment; createdAt: number },
): number {
  return (
    STATUS_RANK[a.assessment.status] - STATUS_RANK[b.assessment.status] ||
    b.assessment.score - a.assessment.score ||
    b.createdAt - a.createdAt
  );
}
