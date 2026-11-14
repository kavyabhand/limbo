/** Friendly, calm guest identities: "Quiet Heron", "Steady Otter". */

const ADJECTIVES = [
  "Quiet", "Calm", "Steady", "Patient", "Bright", "Gentle", "Brave", "Kind", "Clever", "Swift",
  "Sunny", "Merry", "Mellow", "Bold", "Wise", "Cheerful", "Eager", "Lucky", "Noble", "Plucky",
  "Breezy", "Cosy", "Daring", "Jolly", "Nimble", "Polite", "Spry", "Tidy", "Witty", "Zesty",
] as const;

const ANIMALS = [
  "Heron", "Otter", "Falcon", "Panda", "Koala", "Robin", "Lynx", "Ibex", "Crane", "Gecko",
  "Badger", "Puffin", "Marten", "Swift", "Kestrel", "Bison", "Tapir", "Wren", "Hare", "Fox",
  "Owl", "Seal", "Yak", "Zebra", "Egret", "Finch", "Lemur", "Moose", "Quokka", "Stork",
] as const;

/** Mid-tone colours that keep white initials above WCAG AA (4.5:1). */
export const AVATAR_COLORS = [
  "#1d6fa5", "#2e7d32", "#8e44ad", "#b03a2e", "#00695c", "#5d4fb3", "#9c4221", "#1565c0", "#6d4c41", "#ad1457",
] as const;

function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length) % list.length] as T;
}

export function randomGuest(rand: () => number = Math.random): { name: string; color: string } {
  return { name: `${pick(ADJECTIVES, rand)} ${pick(ANIMALS, rand)}`, color: pick(AVATAR_COLORS, rand) };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : [parts[0] ?? "?"];
  return letters.map((p) => Array.from(p ?? "?")[0]?.toUpperCase() ?? "?").join("");
}
