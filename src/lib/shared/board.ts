/**
 * Turns the room's cards into "what's true right now": a one-line status and a
 * short ranked list of facts. Pure, so every client derives the same board
 * from the same signed state.
 */
import type { IntelContent, IntelState } from "./cards.ts";
import { assess, compareForBoard, type CardAssessment } from "./confidence.ts";

export interface CardView {
  content: IntelContent;
  state: IntelState;
}

export interface AssessedCard extends CardView {
  assessment: CardAssessment;
}

export type StatusTone = "cancelled" | "delayed" | "info" | "unknown";

export interface StatusLine {
  tone: StatusTone;
  /** e.g. "Cancelled", "Delayed ~3h", "No confirmed news yet" */
  headline: string;
  /** e.g. "rebooking at Gate 12" */
  detail: string | null;
  /** how sure: official / confirmed / likely / reported */
  basis: "official" | "confirmed" | "likely" | "reported" | null;
  confirmations: number;
  /** delay estimate in minutes when tone is "delayed" */
  delayMinutes?: number;
  /** organisation, when the status comes from an official update */
  org?: string | null;
}

export interface Board {
  status: StatusLine;
  official: AssessedCard[];
  facts: AssessedCard[];
  /** live cards that are not on the board (for the Updates lane count) */
  offBoard: number;
}

export function formatDelay(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const h = minutes / 60;
  const rounded = Math.round(h * 2) / 2; // nearest half hour
  return `~${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
}

/** "about 2 hours", "about 45 minutes", "about 1.5 hours" */
export function delayWords(minutes: number): string {
  if (minutes < 60) return `about ${minutes} minutes`;
  const h = Math.round((minutes / 60) * 2) / 2;
  return `about ${h} ${h === 1 ? "hour" : "hours"}`;
}

const BASIS_FROM_STATUS = {
  official: "official",
  confirmed: "confirmed",
  contested: "reported",
  likely: "likely",
  unconfirmed: "reported",
} as const;

function basisOf(c: AssessedCard): StatusLine["basis"] {
  const s = c.assessment.status;
  return s in BASIS_FROM_STATUS ? BASIS_FROM_STATUS[s as keyof typeof BASIS_FROM_STATUS] : null;
}

const STRONG = new Set(["official", "confirmed", "likely"]);

export function deriveBoard(cards: CardView[], roomSize: number, now: number, maxFacts = 5): Board {
  const assessed: AssessedCard[] = cards.map((c) => ({
    ...c,
    assessment: assess(
      { kind: c.content.kind, official: c.state.official !== null, createdAt: c.content.createdAt, expiresAt: c.content.expiresAt },
      c.state,
      roomSize,
      now,
    ),
  }));
  const live = assessed.filter((c) => c.assessment.status !== "expired" && c.assessment.status !== "superseded");
  const ranked = live
    .filter((c) => c.assessment.onBoard)
    .map((c) => ({ ...c, createdAt: c.content.createdAt }))
    .sort(compareForBoard);

  const official = ranked.filter((c) => c.assessment.status === "official");
  const facts = ranked.filter((c) => c.assessment.status !== "official").slice(0, maxFacts);

  return { status: statusLine(ranked), official, facts, offBoard: live.length - ranked.length };
}

function statusLine(ranked: AssessedCard[]): StatusLine {
  const pick = (kind: IntelContent["kind"], strongOnly: boolean) =>
    ranked.find((c) => c.content.kind === kind && (!strongOnly || STRONG.has(c.assessment.status)));

  const rebooking = pick("rebooking", true) ?? pick("desk", true);
  const detail = rebooking ? rebooking.content.text : null;
  const org = (c: AssessedCard) => c.state.official;

  const cancel = pick("cancel", true);
  if (cancel) {
    return { tone: "cancelled", headline: "Cancelled", detail, basis: basisOf(cancel), confirmations: cancel.state.confirms, org: org(cancel) };
  }
  const delay = pick("delay", false);
  if (delay && delay.content.delayMinutes !== undefined) {
    const mins = delay.content.delayMinutes;
    return {
      tone: mins === 0 ? "info" : "delayed",
      headline: mins === 0 ? "On time" : `Delayed ${delayWords(mins)}`,
      detail,
      basis: basisOf(delay),
      confirmations: delay.state.confirms,
      delayMinutes: mins,
      org: org(delay),
    };
  }
  const reportedCancel = pick("cancel", false);
  if (reportedCancel) {
    return { tone: "cancelled", headline: "Possibly cancelled", detail, basis: "reported", confirmations: reportedCancel.state.confirms };
  }
  if (detail && rebooking) return { tone: "info", headline: detail, detail: null, basis: basisOf(rebooking), confirmations: rebooking.state.confirms, org: org(rebooking) };
  return { tone: "unknown", headline: "No updates yet", detail: null, basis: null, confirmations: 0 };
}
