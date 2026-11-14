"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TimelineItem } from "@/lib/client/room-store";
import { assess } from "@/lib/shared/confidence";
import { useRoom } from "./context";
import { FactRow, useTranslated } from "./FactRow";
import { PoolRow } from "./PoolRow";
import { clock, languageName, POOL_META } from "./meta";

function Bubble({ item, first }: { item: Extract<TimelineItem, { type: "text" }>; first: boolean }) {
  const { store, snap, openReport } = useRoom();
  const [actions, setActions] = useState(false);
  const mine = item.sender.id === snap.me?.id;
  const tr = useTranslated(item.id, item.text);
  const canAct = !mine && item.status === "sent";

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"} ${first ? "mt-4" : "mt-1"}`}>
      {first ? (
        <p className="mb-1 px-1 text-[0.8rem] text-ink-3">
          {mine ? "" : <span className="font-semibold text-ink-2">{item.sender.name} </span>}
          {clock(item.sentTime)}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!canAct}
        onClick={() => setActions((v) => !v)}
        aria-expanded={canAct ? actions : undefined}
        className={`max-w-[85%] rounded-[18px] px-3.5 py-2 text-left text-[1rem] leading-snug break-words whitespace-pre-wrap disabled:cursor-text ${
          mine ? "bg-primary text-primary-ink" : "bg-subtle text-ink"
        } ${item.status === "sending" ? "opacity-50" : ""}`}
        dir="auto"
      >
        {tr.text}
      </button>

      {item.status === "failed" ? (
        <p className="mt-1 px-1 text-[0.85rem] text-danger">
          Not sent.{" "}
          <button type="button" className="font-semibold underline" onClick={() => void store.retrySend(item.id)}>
            Retry
          </button>{" "}
          <button type="button" className="underline" onClick={() => store.discardFailed(item.id)}>
            Remove
          </button>
        </p>
      ) : null}

      {tr.translated || tr.pending || tr.failed ? (
        <p className="mt-1 px-1 text-[0.8rem] text-ink-3">
          {tr.pending ? (
            "Translating…"
          ) : tr.failed ? (
            "Couldn't translate"
          ) : (
            <button type="button" onClick={tr.toggle} className="underline-offset-2 hover:underline">
              {tr.showOriginal ? "Show translation" : `Translated from ${languageName(item.sender.lang)}`}
            </button>
          )}
        </p>
      ) : null}

      {actions && canAct ? (
        <div className="fade-up mt-1 flex gap-1 px-0.5">
          {!tr.translated && !tr.pending ? (
            <button
              type="button"
              onClick={() => {
                store.translate(item.id);
                setActions(false);
              }}
              className="h-8 rounded-full bg-subtle px-3 text-[0.85rem] font-medium"
            >
              Translate
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setActions(false);
              openReport({ type: "message", id: item.id, label: item.text });
            }}
            className="h-8 rounded-full bg-subtle px-3 text-[0.85rem] font-medium"
          >
            Report
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Inline({ who, children }: { who: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1 px-1 text-[0.8rem] text-ink-3">{who}</p>
      <div className="rounded-2xl border border-line px-3.5">{children}</div>
    </div>
  );
}

export function Timeline({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { snap, store, now } = useRoom();
  const items = snap.timeline;
  const roomSize = Math.max(1, snap.members.recent || snap.members.total);
  const [unseen, setUnseen] = useState(0);
  // Whether the reader is at the bottom, measured from the real scroll position (not assumed).
  const atBottom = useRef(false);
  const lastCount = useRef(items.length);
  const lastId = items.at(-1)?.id;

  // Follow new messages only when the reader is already at the bottom; otherwise count them.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const added = items.length - lastCount.current;
    lastCount.current = items.length;
    if (added <= 0) return;
    const last = items.at(-1);
    const lastIsMine = last?.type === "text" && last.sender.id === snap.me?.id;
    if (atBottom.current || lastIsMine) el.scrollTop = el.scrollHeight;
    else setUnseen((n) => n + added);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the newest item changes
  }, [lastId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (atBottom.current) setUnseen(0);
    };
    const frame = requestAnimationFrame(measure);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", measure);
    };
  }, [scrollRef]);

  async function loadOlder() {
    const el = scrollRef.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    await store.loadHistory(false);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  }

  return (
    <div className="relative pb-3">
      {snap.history.hasMore ? (
        <div className="flex justify-center pt-2">
          <button type="button" disabled={snap.history.loading} onClick={() => void loadOlder()} className="min-h-10 px-3 text-[0.85rem] font-medium text-ink-2">
            {snap.history.loading ? "Loading…" : "Earlier messages"}
          </button>
        </div>
      ) : null}

      {items.length === 0 ? <p className="py-8 text-center text-[0.95rem] text-ink-3">No messages yet. Say hello.</p> : null}

      <ol aria-label="Messages">
        {items.map((item, idx) => {
          const prev = items[idx - 1];
          if (item.type === "text") {
            const first = !(prev?.type === "text" && prev.sender.id === item.sender.id && item.sentTime - prev.sentTime < 5 * 60_000);
            return (
              <li key={item.id}>
                <Bubble item={item} first={first} />
              </li>
            );
          }
          if (item.type === "intel") {
            const entry = snap.cards[item.cardId];
            if (!entry) return null;
            const a = assess(
              { kind: entry.content.kind, official: entry.state.official !== null, createdAt: entry.content.createdAt, expiresAt: entry.content.expiresAt },
              entry.state,
              roomSize,
              now,
            );
            const who = entry.state.official ? `${entry.state.official} posted an official update` : entry.content.author.id === snap.me?.id ? "You posted an update" : `${entry.content.author.name} posted an update`;
            return (
              <li key={item.id} className="fade-up">
                <Inline who={who}>
                  <FactRow entry={entry} assessment={a} />
                </Inline>
              </li>
            );
          }
          if (item.type === "pool") {
            const pool = snap.pools[item.poolId];
            if (!pool) return null;
            const kind = POOL_META[pool.content.kind].label.toLowerCase();
            const who = pool.me.organiser ? `You're sharing a ${kind}` : `${pool.content.organiser.name} is sharing a ${kind}`;
            return (
              <li key={item.id} className="fade-up">
                <Inline who={who}>
                  <PoolRow pool={pool} />
                </Inline>
              </li>
            );
          }
          return (
            <li key={item.id} className="mt-4 text-center text-[0.8rem] text-ink-3">
              {item.text}
            </li>
          );
        })}
      </ol>

      {unseen > 0 ? (
        <button
          type="button"
          onClick={() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
            setUnseen(0);
          }}
          className="sticky bottom-3 mx-auto mt-2 flex h-9 items-center rounded-full bg-primary px-4 text-[0.85rem] font-semibold text-primary-ink shadow-lg"
        >
          {unseen} new
        </button>
      ) : null}
    </div>
  );
}
