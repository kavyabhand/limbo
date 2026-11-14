"use client";

import { useState } from "react";
import type { CardEntry } from "@/lib/client/room-store";
import type { CardAssessment } from "@/lib/shared/confidence";
import { formatDelay } from "@/lib/shared/board";
import { ApiError } from "@/lib/client/api";
import { useToast } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { useRoom } from "./context";
import { joinDetail, KIND_META, languageName, plural, relTime } from "./meta";

/** Translated text when available, with a way back to the original. */
export function useTranslated(messageId: string | null, original: string) {
  const { snap } = useRoom();
  const [showOriginal, setShowOriginal] = useState(false);
  const t = messageId ? snap.translations[messageId] : undefined;
  const translated = t?.status === "done" && Boolean(t.text);
  return {
    text: translated && !showOriginal ? t!.text! : original,
    translated,
    pending: t?.status === "pending",
    failed: t?.status === "failed",
    showOriginal,
    toggle: () => setShowOriginal((v) => !v),
  };
}

function statusOf(entry: CardEntry, a: CardAssessment): { text: string; cls: string } {
  const { confirms, disputes } = entry.state;
  switch (a.status) {
    case "official":
      return { text: `Official · ${entry.state.official}`, cls: "text-official font-medium" };
    case "confirmed":
      return { text: `Confirmed by ${confirms}`, cls: "text-ok font-medium" };
    case "likely":
      return { text: `${confirms} confirmed`, cls: "text-ok" };
    case "contested":
      return { text: `Disputed by ${disputes}`, cls: "text-warn font-medium" };
    case "unconfirmed":
      return { text: disputes ? `Disputed by ${disputes}` : "Not confirmed yet", cls: disputes ? "text-warn" : "" };
    default:
      return { text: "Out of date", cls: "" };
  }
}

/** One crowd-reported update: the text, how sure people are, and a one-tap confirm. */
export function FactRow({ entry, assessment }: { entry: CardEntry; assessment: CardAssessment }) {
  const { store, snap, now, openReport } = useRoom();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = entry.content;
  const official = assessment.status === "official";
  const mine = c.author.id === snap.me?.id;
  const live = assessment.status !== "expired" && assessment.status !== "superseded";
  const canVote = live && !official && !mine && snap.writable;
  const original = joinDetail(c.text, c.detail);
  const tr = useTranslated(entry.messageId, original);
  const status = statusOf(entry, assessment);
  const kind = c.kind === "delay" && c.delayMinutes ? `Delay ${formatDelay(c.delayMinutes)}` : KIND_META[c.kind].label;
  const when = relTime(entry.state.lastConfirmAt ?? c.createdAt, now);

  async function vote(choice: "confirm" | "dispute") {
    setBusy(true);
    try {
      await store.vote(c.cardId, entry.myVote === choice ? "none" : choice);
      if (choice === "dispute" && entry.myVote !== "dispute") toast("Marked as not right");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={live ? "" : "opacity-55"}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-w-0 flex-1 py-2.5 text-left">
          <p className={`text-[1rem] leading-snug ${official ? "font-medium" : ""} ${open ? "" : "line-clamp-3"}`} dir="auto">
            {tr.text}
          </p>
          <p className="mt-0.5 text-[0.85rem] text-ink-3">
            <span className={status.cls}>{status.text}</span>
            {" · "}
            {kind}
            {" · "}
            {when}
            {tr.translated ? " · Translated" : tr.pending ? " · Translating…" : ""}
          </p>
        </button>
        {canVote ? (
          <button
            type="button"
            aria-pressed={entry.myVote === "confirm"}
            aria-label={entry.myVote === "confirm" ? "You confirmed this. Tap to undo" : `Confirm this (${plural(entry.state.confirms, "confirmation")} so far)`}
            disabled={busy}
            onClick={() => void vote("confirm")}
            className={`mt-2 flex h-9 min-w-[3rem] shrink-0 items-center justify-center gap-1 rounded-full px-3 text-[0.9rem] font-semibold tabular-nums transition-colors ${
              entry.myVote === "confirm" ? "bg-ok text-on-color" : "bg-subtle text-ink hover:bg-subtle-2"
            }`}
          >
            <CheckIcon width={16} height={16} strokeWidth={2.4} />
            {entry.state.confirms > 0 ? entry.state.confirms : null}
          </button>
        ) : !official && entry.state.confirms > 0 ? (
          <span className="mt-2 flex h-9 items-center gap-1 px-2 text-[0.9rem] text-ink-3 tabular-nums" aria-label={plural(entry.state.confirms, "confirmation")}>
            <CheckIcon width={16} height={16} /> {entry.state.confirms}
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="fade-up mb-2 rounded-xl bg-subtle px-3.5 py-3 text-[0.9rem] text-ink-2">
          <p>
            {official ? `Posted by ${entry.state.official} staff` : mine ? "You posted this" : `Posted by ${c.author.name}`}
            {c.source === "saw_myself" ? ", who saw it themselves" : ""}.
            {tr.translated ? (
              <>
                {" "}
                <button type="button" onClick={tr.toggle} className="underline underline-offset-2">
                  {tr.showOriginal ? "Show translation" : `Show original (${languageName(c.lang)})`}
                </button>
              </>
            ) : null}
          </p>
          {!mine && live ? (
            <div className="mt-2.5 flex gap-2">
              {canVote ? (
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={entry.myVote === "dispute"}
                  onClick={() => void vote("dispute")}
                  className={`h-9 rounded-full px-3.5 font-medium ${entry.myVote === "dispute" ? "bg-warn text-on-color" : "bg-bg text-ink"}`}
                >
                  {entry.myVote === "dispute" ? "You said it's not right" : "Not right"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => openReport({ type: "card", id: c.cardId, label: original })}
                className="h-9 rounded-full bg-bg px-3.5 font-medium text-ink"
              >
                Report
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
