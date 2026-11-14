"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import type { RoomInfo } from "@/lib/shared/dto";
import { useRoom } from "./context";

/** Seconds after the room opens at which each scripted step fires (mirrors DEMO_SCHEDULE on the server). */
const SCHEDULE = [0, 6, 12, 18, 24, 34, 46, 56, 66, 78];

const TIPS = [
  { at: 0, text: "Everyone else here is simulated. Watch, or join in." },
  { at: 7, text: "Someone found the rebooking desk. Tap ✓ if you agree." },
  { at: 19, text: "That German message was translated for you." },
  { at: 25, text: "Someone is sharing a hotel room. Tap Join to take a spot." },
  { at: 47, text: "A Hindi message, translated for you." },
  { at: 67, text: "The airline posted an official update." },
  { at: 79, text: "That's the demo. Try posting an update or sharing a cab." },
];

/** Drives the scripted demo. Always labelled as simulated. */
export function DemoDirector() {
  const { snap } = useRoom();
  const router = useRouter();
  const roomId = snap.room?.id;
  const [elapsed, setElapsed] = useState(0);
  const [restarting, setRestarting] = useState(false);
  const fired = useRef(new Set<number>());

  useEffect(() => {
    if (!roomId) return;
    const key = `limbo:demo:${roomId}`;
    let t0 = Date.now();
    try {
      const saved = Number(sessionStorage.getItem(key));
      if (saved > 0) t0 = saved;
      else sessionStorage.setItem(key, String(t0));
    } catch {
      /* fine without persistence */
    }
    const tick = () => {
      const secs = Math.floor((Date.now() - t0) / 1000);
      setElapsed(secs);
      SCHEDULE.forEach((at, step) => {
        if (step === 0 || secs < at || fired.current.has(step)) return;
        fired.current.add(step);
        void api(`/api/demo/${roomId}/step`, { body: { step } }).catch(() => fired.current.delete(step));
      });
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [roomId]);

  async function restart() {
    setRestarting(true);
    try {
      const { room } = await api<{ room: RoomInfo }>("/api/demo", { body: {} });
      router.push(`/r/${room.slug}`);
    } catch {
      setRestarting(false);
    }
  }

  const tip = [...TIPS].reverse().find((t) => elapsed >= t.at);

  return (
    <div role="region" aria-label="Demo" className="flex items-start gap-3 border-b border-line bg-subtle px-4 py-2 text-[0.85rem]">
      <p className="min-w-0 flex-1 text-ink-2" aria-live="polite">
        <span className="font-semibold text-ink">Demo. </span>
        {tip?.text}
      </p>
      <button type="button" disabled={restarting} onClick={() => void restart()} className="shrink-0 font-medium text-ink underline underline-offset-2">
        {restarting ? "Restarting…" : "Restart"}
      </button>
    </div>
  );
}
