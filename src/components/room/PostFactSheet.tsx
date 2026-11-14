"use client";

import { useId, useState } from "react";
import { LIMITS, type IntelKind } from "@/lib/shared/cards";
import { ApiError } from "@/lib/client/api";
import { Button, ErrorText, inputClass, Option, Sheet, useToast } from "@/components/ui";
import { useRoom } from "./context";
import { KIND_META, looksLikeContactDetails, MORE_KINDS, PRIMARY_KINDS } from "./meta";

const DELAYS: [number, string][] = [
  [0, "On time"],
  [30, "30 min"],
  [60, "1 h"],
  [120, "2 h"],
  [180, "3 h"],
  [240, "4 h"],
  [360, "6 h+"],
];

export function PostFactSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { store, snap } = useRoom();
  const toast = useToast();
  const textId = useId();
  const [kind, setKind] = useState<IntelKind>("delay");
  const [more, setMore] = useState(false);
  const [text, setText] = useState("");
  const [delay, setDelay] = useState<number | null>(null);
  const [sawIt, setSawIt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const org = snap.me?.agentOrg;
  const kinds = more ? [...PRIMARY_KINDS, ...MORE_KINDS] : PRIMARY_KINDS;

  async function submit() {
    setError(null);
    if (kind === "delay" && delay === null) return setError("Pick how late it is.");
    if (!text.trim()) return setError("Write a few words about what you saw.");
    if (looksLikeContactDetails(text)) return setError("Please don't post phone numbers or emails here.");
    setBusy(true);
    try {
      await store.postIntel({
        kind,
        text: text.trim(),
        ...(kind === "delay" && delay !== null ? { delayMinutes: delay } : {}),
        ...(sawIt ? { source: "saw_myself" as const } : {}),
      });
      toast("Posted");
      setText("");
      setDelay(null);
      setSawIt(false);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't post that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={org ? `Official update from ${org}` : "Post an update"}
      footer={
        <>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button busy={busy} onClick={() => void submit()}>
            {busy ? "Posting…" : "Post"}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="Type of update">
        {kinds.map((k) => (
          <Option
            key={k}
            selected={k === kind}
            onClick={() => {
              setKind(k);
              setError(null);
            }}
          >
            {KIND_META[k].label}
          </Option>
        ))}
        {!more ? (
          <button type="button" onClick={() => setMore(true)} className="min-h-10 px-2 text-[0.95rem] text-ink-3">
            More
          </button>
        ) : null}
      </div>

      {kind === "delay" ? (
        <div className="mt-5">
          <p className="mb-2 text-[0.9rem] font-medium text-ink-2">How late?</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="How late">
            {DELAYS.map(([m, label]) => (
              <Option key={m} selected={delay === m} onClick={() => setDelay(m)}>
                {label}
              </Option>
            ))}
          </div>
        </div>
      ) : null}

      <label htmlFor={textId} className="mt-5 mb-1.5 block text-[0.9rem] font-medium text-ink-2">
        What did you see or hear?
      </label>
      <input
        id={textId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={LIMITS.intelText}
        placeholder={KIND_META[kind].placeholder}
        dir="auto"
        className={inputClass}
      />

      {!org ? (
        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-[0.95rem]">
          <input type="checkbox" checked={sawIt} onChange={(e) => setSawIt(e.target.checked)} className="size-5 accent-[var(--primary)]" />I saw this
          myself
        </label>
      ) : (
        <p className="mt-4 text-[0.9rem] text-ink-3">This will be pinned for everyone with an Official label.</p>
      )}
    </Sheet>
  );
}
