"use client";

import { useState } from "react";
import type { PoolEntry } from "@/lib/client/room-store";
import { formatMoney, perPersonCost } from "@/lib/shared/cards";
import { ApiError } from "@/lib/client/api";
import { useToast } from "@/components/ui";
import { useRoom } from "./context";
import { clock, POOL_META } from "./meta";

export function poolTitle(p: PoolEntry): string {
  return `${POOL_META[p.content.kind].noun} ${p.content.place}`;
}

export function poolDetails(p: PoolEntry): string {
  const c = p.content;
  const taken = p.state.members.length;
  const left = c.capacity - taken;
  const parts: string[] = [];
  const each = perPersonCost(c.totalCost, c.capacity);
  if (each) parts.push(`${formatMoney(each, c.currency)} each`);
  if (p.state.status === "done") parts.push("Done");
  else if (p.state.status === "cancelled") parts.push("Cancelled");
  else parts.push(left > 0 ? `${left} ${left === 1 ? "spot" : "spots"} left` : "Full");
  if (c.departsAt && p.state.status !== "done" && p.state.status !== "cancelled") parts.push(`leaves ${clock(c.departsAt)}`);
  return parts.join(" · ");
}

/** A shared cab, room or meal, with one clear action. */
export function PoolRow({ pool }: { pool: PoolEntry }) {
  const { store, snap, openPool } = useRoom();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const closed = pool.state.status === "done" || pool.state.status === "cancelled";

  async function run(action: "claim" | "release") {
    setBusy(true);
    try {
      const outcome = await store.poolAction(pool.poolId, action);
      if (outcome === "seat") {
        toast("You're in");
        openPool(pool.poolId);
      } else if (outcome === "waitlisted") toast("It just filled up. You're on the waitlist.");
      else if (action === "release") toast("Left the waitlist");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  let action: React.ReactNode = null;
  const btn = "h-9 shrink-0 rounded-full px-4 text-[0.9rem] font-semibold disabled:opacity-50";
  if (pool.me.seat) {
    action = (
      <button type="button" onClick={() => openPool(pool.poolId)} className={`${btn} bg-subtle text-ink`}>
        Open
      </button>
    );
  } else if (pool.me.waitlisted) {
    action = (
      <button type="button" disabled={busy} onClick={() => void run("release")} className={`${btn} bg-subtle text-ink`}>
        Leave
      </button>
    );
  } else if (!closed && snap.writable) {
    action = (
      <button type="button" disabled={busy} onClick={() => void run("claim")} className={`${btn} bg-primary text-primary-ink`}>
        {pool.state.status === "full" ? "Waitlist" : "Join"}
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-3 py-2.5 ${closed ? "opacity-55" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[1rem] leading-snug" dir="auto">
          {poolTitle(pool)}
        </p>
        <p className="mt-0.5 truncate text-[0.85rem] text-ink-3">
          {poolDetails(pool)}
          {pool.me.organiser ? " · yours" : pool.me.waitlisted ? " · you're on the waitlist" : ""}
        </p>
      </div>
      {action}
    </div>
  );
}
