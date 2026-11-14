"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** false during SSR and the hydration pass, true afterwards. For values that depend on the browser (clock, storage). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
