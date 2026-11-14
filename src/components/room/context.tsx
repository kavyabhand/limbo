"use client";

import { createContext, useContext } from "react";
import type { RoomSnapshot, RoomStore } from "@/lib/client/room-store";

export interface RoomCtx {
  store: RoomStore;
  snap: RoomSnapshot;
  /** ticks every 30s so freshness and decay re-render */
  now: number;
  openPool: (poolId: string) => void;
  openReport: (target: { type: "message" | "card" | "pool"; id: string; label: string }) => void;
}

export const RoomContext = createContext<RoomCtx | null>(null);

export function useRoom(): RoomCtx {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoom outside RoomContext");
  return ctx;
}
