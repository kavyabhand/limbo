"use client";

export interface RecentRoom {
  slug: string;
  label: string;
  mode: "flight" | "train" | "bus";
  at: number;
}

const KEY = "limbo:recent";
const MAX = 5;

export function readRecent(): RecentRoom[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentRoom[];
    return Array.isArray(list) ? list.filter((r) => r && typeof r.slug === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberRoom(room: Omit<RecentRoom, "at">): void {
  try {
    const next = [{ ...room, at: Date.now() }, ...readRecent().filter((r) => r.slug !== room.slug)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable (private mode); recents are a convenience only */
  }
}
