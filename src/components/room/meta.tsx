import type { IntelKind, PoolKind } from "@/lib/shared/cards";

export const KIND_META: Record<IntelKind, { label: string; placeholder: string }> = {
  delay: { label: "Delay", placeholder: "Board says 3 hours late" },
  cancel: { label: "Cancelled", placeholder: "Staff at the gate say it's cancelled" },
  gate: { label: "Gate", placeholder: "Moved to gate 14" },
  desk: { label: "Desk", placeholder: "Rebooking desk open at gate 12" },
  rebooking: { label: "Rebooking", placeholder: "Moved to AI 103 at 07:40" },
  food: { label: "Food", placeholder: "Free tea at the platform 2 stall" },
  refund: { label: "Refund", placeholder: "Meal vouchers at the info desk" },
  safety: { label: "Safety", placeholder: "Wet floor near exit 3" },
  other: { label: "Other", placeholder: "Charging points near gate 9 work" },
};

/** The kinds offered first when posting; the rest sit behind "More". */
export const PRIMARY_KINDS: IntelKind[] = ["delay", "gate", "desk", "food", "cancel", "other"];
export const MORE_KINDS: IntelKind[] = ["rebooking", "refund", "safety"];

export const POOL_META: Record<PoolKind, { label: string; noun: string; placeholder: string }> = {
  cab: { label: "Cab", noun: "Cab to", placeholder: "City centre" },
  hotel: { label: "Hotel room", noun: "Room at", placeholder: "Airport Plaza" },
  meal: { label: "Meal", noun: "Meal at", placeholder: "Food court, terminal 2" },
};

export function relTime(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function languageName(code: string | null | undefined): string {
  if (!code) return "another language";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function joinDetail(text: string, detail?: string): string {
  if (!detail) return text;
  return /[.!?。।]$/.test(text) ? `${text} ${detail}` : `${text}. ${detail}`;
}

/** Light-touch check before posting publicly (the server enforces the same rule for updates and pools). */
export { looksLikeContactDetails } from "@/lib/shared/cards";
