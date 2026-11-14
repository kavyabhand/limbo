"use client";

import { useId, useState } from "react";
import { formatMoney, LIMITS, POOL_KINDS, type PoolKind } from "@/lib/shared/cards";
import { ApiError } from "@/lib/client/api";
import { Button, ErrorText, Field, inputClass, Option, Sheet, useToast } from "@/components/ui";
import { useRoom } from "./context";
import { looksLikeContactDetails, POOL_META } from "./meta";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];

/** "HH:MM" today (or tomorrow if that time has passed) -> epoch ms */
function timeToEpoch(hhmm: string): number | undefined {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return undefined;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() < Date.now() - 30 * 60_000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function CreatePoolSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (poolId: string) => void }) {
  const { store } = useRoom();
  const toast = useToast();
  const ids = { place: useId(), cost: useId(), time: useId(), currency: useId() };
  const [kind, setKind] = useState<PoolKind>("cab");
  const [place, setPlace] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [cost, setCost] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = cost ? Math.round(Number(cost)) : undefined;
  const each = total && total > 0 ? Math.ceil(total / capacity) : null;
  const placeLabel = kind === "cab" ? "Going to" : kind === "hotel" ? "Which hotel or area?" : "Where?";

  async function submit() {
    setError(null);
    if (!place.trim()) return setError(kind === "cab" ? "Where are you going?" : "Add a place.");
    if (looksLikeContactDetails(place)) return setError("Share numbers in the chat once people join, not here.");
    setBusy(true);
    try {
      const before = new Set(Object.keys(store.getSnapshot().pools));
      await store.createPool({
        kind,
        place: place.trim(),
        capacity,
        currency,
        ...(total !== undefined && total > 0 ? { totalCost: total } : {}),
        ...(time ? { departsAt: timeToEpoch(time) } : {}),
      });
      const created = Object.keys(store.getSnapshot().pools).find((id) => !before.has(id));
      toast("Shared. Others can join now.");
      setPlace("");
      setCost("");
      setTime("");
      onClose();
      if (created) onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Share a cab or room"
      footer={
        <>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <p className="mb-3 text-[0.85rem] text-ink-3">Meet somewhere public and agree the price first. Limbo never handles money.</p>
          <Button busy={busy} onClick={() => void submit()}>
            {busy ? "Sharing…" : "Share"}
          </Button>
        </>
      }
    >
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="What are you sharing?">
        {POOL_KINDS.map((k) => (
          <Option key={k} selected={k === kind} onClick={() => setKind(k)}>
            {POOL_META[k].label}
          </Option>
        ))}
      </div>

      <Field label={placeLabel} htmlFor={ids.place}>
        <input
          id={ids.place}
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          maxLength={LIMITS.poolPlace}
          placeholder={POOL_META[kind].placeholder}
          dir="auto"
          className={inputClass}
        />
      </Field>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-[0.9rem] font-medium text-ink-2" id={`${ids.place}-n`}>
          People, including you
        </p>
        <div className="flex items-center gap-1" role="group" aria-labelledby={`${ids.place}-n`}>
          <button
            type="button"
            aria-label="Fewer people"
            disabled={capacity <= LIMITS.poolCapacity.min}
            onClick={() => setCapacity((c) => c - 1)}
            className="grid size-10 place-items-center rounded-full bg-subtle text-lg disabled:opacity-30"
          >
            −
          </button>
          <output aria-live="polite" className="w-8 text-center text-lg font-semibold tabular-nums">
            {capacity}
          </output>
          <button
            type="button"
            aria-label="More people"
            disabled={capacity >= LIMITS.poolCapacity.max}
            onClick={() => setCapacity((c) => c + 1)}
            className="grid size-10 place-items-center rounded-full bg-subtle text-lg disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Field label="Total cost (optional)" htmlFor={ids.cost} hint={each ? `About ${formatMoney(each, currency)} each` : undefined}>
          <input id={ids.cost} value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="1400" className={inputClass} />
        </Field>
        <Field label="Currency" htmlFor={ids.currency}>
          <select id={ids.currency} value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={kind === "cab" ? "Leaving at (optional)" : "Time (optional)"} htmlFor={ids.time}>
        <input id={ids.time} type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${inputClass} w-36`} />
      </Field>
    </Sheet>
  );
}
