"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { readRecent, type RecentRoom } from "@/lib/client/recent";
import { useHydrated } from "@/lib/client/useHydrated";
import { checkCode, DATE_WINDOW, type TripMode } from "@/lib/shared/trip";
import { Button } from "@/components/ui";

const MODES: { mode: TripMode; label: string; field: string; placeholder: string; hint: string }[] = [
  { mode: "flight", label: "Flight", field: "Flight number", placeholder: "AI 101", hint: "Like AI 101 or 6E 2134" },
  { mode: "train", label: "Train", field: "Train number", placeholder: "12627", hint: "The 5-digit train number" },
  { mode: "bus", label: "Bus", field: "Bus", placeholder: "KSRTC MYS 2230", hint: "Operator, route and time" },
];

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface JoinResponse {
  needsConfirm?: boolean;
  room?: { slug: string };
}

export function TripForm() {
  const router = useRouter();
  const ids = { code: useId(), date: useId(), hint: useId() };
  const [mode, setMode] = useState<TripMode>("flight");
  const [code, setCode] = useState("");
  const [pickedDate, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUnusual, setConfirmUnusual] = useState(false);

  // Dates and recents depend on the traveller's clock and storage: client only.
  const hydrated = useHydrated();
  const date = pickedDate ?? (hydrated ? localDate() : "");
  const bounds = hydrated ? { min: localDate(-DATE_WINDOW.pastDays), max: localDate(DATE_WINDOW.futureDays) } : { min: "", max: "" };
  const recent: RecentRoom[] = useMemo(() => (hydrated ? readRecent() : []), [hydrated]);
  const current = MODES.find((m) => m.mode === mode) ?? MODES[0]!;

  async function join() {
    setError(null);
    const check = checkCode(mode, code);
    if (!check.ok) return setError(check.reason === "empty" ? `Enter your ${current.field.toLowerCase()}.` : `That doesn't look right. ${current.hint}.`);
    if (!date) return setError("Pick a date.");
    setBusy(true);
    try {
      const res = await api<JoinResponse>("/api/rooms/join", { body: { mode, code, date, force: confirmUnusual } });
      if (res.needsConfirm) {
        setConfirmUnusual(true);
        setBusy(false);
        return;
      }
      if (res.room) router.push(`/r/${res.room.slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
        noValidate
      >
        <div role="radiogroup" aria-label="Trip type" className="mb-5 flex gap-5 border-b border-line">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              role="radio"
              aria-checked={m.mode === mode}
              onClick={() => {
                setMode(m.mode);
                setConfirmUnusual(false);
                setError(null);
              }}
              className={`-mb-px border-b-2 pb-2.5 text-[0.95rem] font-medium transition-colors ${
                m.mode === mode ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <label htmlFor={ids.code} className="sr-only">
          {current.field}
        </label>
        <input
          id={ids.code}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setConfirmUnusual(false);
            setError(null);
          }}
          placeholder={current.placeholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode={mode === "train" ? "numeric" : "text"}
          maxLength={32}
          aria-describedby={ids.hint}
          aria-invalid={Boolean(error)}
          className="h-14 w-full rounded-xl bg-subtle px-4 text-xl font-semibold tracking-wide uppercase outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-3 placeholder:normal-case focus:ring-2 focus:ring-[var(--focus)]"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p id={ids.hint} className="text-[0.85rem] text-ink-3">
            {current.hint}
          </p>
          <label htmlFor={ids.date} className="sr-only">
            Travel date
          </label>
          <input
            id={ids.date}
            type="date"
            value={date}
            min={bounds.min || undefined}
            max={bounds.max || undefined}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-lg bg-transparent text-right text-[0.9rem] text-ink-2 outline-none focus:ring-2 focus:ring-[var(--focus)]"
          />
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-[0.9rem] text-danger">
            {error}
          </p>
        ) : null}
        {confirmUnusual ? (
          <p role="status" className="mt-4 text-[0.9rem] text-ink-2">
            We don&apos;t recognise <span className="font-semibold text-ink">{code.toUpperCase()}</span>. Check it, or continue and
            we&apos;ll open a room for it anyway.
          </p>
        ) : null}

        <Button type="submit" busy={busy} className="mt-5">
          {busy ? "Opening…" : "Continue"}
        </Button>
      </form>

      {recent.length > 0 ? (
        <nav aria-label="Recent rooms" className="mt-8">
          <p className="mb-1 text-[0.85rem] text-ink-3">Recent</p>
          <ul>
            {recent.map((r) => (
              <li key={r.slug}>
                <Link href={`/r/${r.slug}`} className="flex min-h-11 items-center justify-between border-b border-line text-[0.95rem]">
                  <span>{r.label}</span>
                  <span aria-hidden className="text-ink-3">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
