"use client";

import { useMemo, useState } from "react";
import { deriveBoard, type Board } from "@/lib/shared/board";
import { useRoom } from "./context";
import { FactRow } from "./FactRow";
import { PoolRow } from "./PoolRow";
import { plural } from "./meta";

export function useBoard(): Board {
  const { snap, now } = useRoom();
  const roomSize = Math.max(1, snap.members.recent || snap.members.total);
  return useMemo(
    () => deriveBoard(Object.values(snap.cards).map((c) => ({ content: c.content, state: c.state })), roomSize, now),
    [snap.cards, roomSize, now],
  );
}

const TONE = { cancelled: "text-danger", delayed: "text-warn", info: "text-ink", unknown: "text-ink" } as const;

function basisText(s: Board["status"]): string {
  switch (s.basis) {
    case "official":
      return `Official update from ${s.org ?? "staff"}`;
    case "confirmed":
      return `Confirmed by ${plural(s.confirmations, "person", "people")}`;
    case "likely":
      return `${plural(s.confirmations, "person", "people")} confirmed`;
    case "reported":
      return "Reported, not confirmed yet";
    default:
      return "Post what you see, or confirm what others post.";
  }
}

/** The answer to "what's happening?", in one glance. */
export function StatusHeader({ compact = false }: { compact?: boolean }) {
  const board = useBoard();
  const s = board.status;
  if (compact) {
    return (
      <p className="truncate text-[0.95rem]" role="status">
        <span className={`font-semibold ${TONE[s.tone]}`}>{s.headline}</span>
        {s.detail ? <span className="text-ink-2"> · {s.detail}</span> : null}
      </p>
    );
  }
  return (
    <div role="status" aria-live="polite">
      <p className={`text-[1.65rem] leading-tight font-semibold tracking-tight ${TONE[s.tone]}`}>{s.headline}</p>
      {s.detail ? (
        <p className="mt-1 text-[1.05rem] leading-snug" dir="auto">
          {s.detail}
        </p>
      ) : null}
      <p className="mt-1 text-[0.9rem] text-ink-3">{basisText(s)}</p>
    </div>
  );
}

const SHOW = 4;

export function NowPanel({ statusRef }: { statusRef?: React.Ref<HTMLDivElement> }) {
  const { snap } = useRoom();
  const board = useBoard();
  const [all, setAll] = useState(false);
  const facts = [...board.official, ...board.facts];
  const shown = all ? facts : facts.slice(0, SHOW);
  const pools = Object.values(snap.pools)
    .filter((p) => p.state.status === "open" || p.state.status === "full" || p.me.seat || p.me.organiser)
    .sort((a, b) => b.content.createdAt - a.content.createdAt);

  return (
    <section aria-label="What's happening" className="flex flex-col gap-6">
      <div ref={statusRef}>
        <StatusHeader />
      </div>

      {facts.length > 0 ? (
        <div>
          <h2 className="mb-0.5 text-[0.85rem] font-medium text-ink-3">Updates</h2>
          <ul className="divide-y divide-line">
            {shown.map((c) => {
              const entry = snap.cards[c.content.cardId];
              return entry ? (
                <li key={c.content.cardId} className="fade-up">
                  <FactRow entry={entry} assessment={c.assessment} />
                </li>
              ) : null;
            })}
          </ul>
          {facts.length > SHOW ? (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 min-h-10 text-[0.9rem] font-medium text-ink-2">
              {all ? "Show fewer" : `Show all ${facts.length}`}
            </button>
          ) : null}
        </div>
      ) : null}

      {pools.length > 0 ? (
        <div>
          <h2 className="mb-0.5 text-[0.85rem] font-medium text-ink-3">Shared rides and rooms</h2>
          <ul className="divide-y divide-line">
            {pools.map((p) => (
              <li key={p.poolId}>
                <PoolRow pool={p} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
