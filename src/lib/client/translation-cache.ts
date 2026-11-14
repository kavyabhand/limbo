"use client";

/** Small per-language cache so a message is never translated (and billed) twice on this device. */
const MAX = 400;

function key(lang: string) {
  return `limbo:tr:${lang}`;
}

function read(lang: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key(lang)) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function readTranslation(lang: string, messageId: string): string | null {
  return read(lang)[messageId] ?? null;
}

export function saveTranslation(lang: string, messageId: string, text: string): void {
  try {
    const all = read(lang);
    all[messageId] = text;
    const entries = Object.entries(all);
    const trimmed = entries.length > MAX ? Object.fromEntries(entries.slice(entries.length - MAX)) : all;
    localStorage.setItem(key(lang), JSON.stringify(trimmed));
  } catch {
    /* cache is optional */
  }
}
