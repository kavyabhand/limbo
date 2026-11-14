"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { LANGUAGES } from "@/lib/shared/i18n";
import { LIMITS } from "@/lib/shared/cards";
import { ApiError } from "@/lib/client/api";
import { Button, Field, inputClass, Option, Sheet, useToast } from "@/components/ui";
import { useRoom } from "./context";

type Prefs = { theme?: "auto" | "light" | "dark"; text?: "normal" | "large" | "xl" };

function readPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem("limbo:prefs") ?? "{}") as Prefs;
  } catch {
    return {};
  }
}

function writePrefs(patch: Prefs) {
  const next = { ...readPrefs(), ...patch };
  try {
    localStorage.setItem("limbo:prefs", JSON.stringify(next));
  } catch {
    /* preference only */
  }
  const d = document.documentElement;
  if (next.theme && next.theme !== "auto") d.dataset.theme = next.theme;
  else delete d.dataset.theme;
  if (next.text && next.text !== "normal") d.dataset.text = next.text;
  else delete d.dataset.text;
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { store, snap } = useRoom();
  const toast = useToast();
  const ids = { name: useId(), lang: useId() };
  const me = snap.me;
  const [name, setName] = useState(me?.name ?? "");
  const [language, setLanguage] = useState(me?.language ?? "en");
  const [prefs, setPrefs] = useState<Prefs>(() => (typeof window === "undefined" ? {} : readPrefs()));
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!me) return;
    const patch: { name?: string; language?: string } = {};
    if (name.trim() && name.trim() !== me.name) patch.name = name.trim();
    if (language !== me.language) patch.language = language;
    if (Object.keys(patch).length === 0) return onClose();
    setBusy(true);
    try {
      await store.updateMe(patch);
      toast("Saved");
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  function setPref(p: Prefs) {
    writePrefs(p);
    setPrefs((cur) => ({ ...cur, ...p }));
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Settings"
      footer={
        <Button busy={busy} onClick={() => void save()}>
          Done
        </Button>
      }
    >
      <Field label="Your name in this room" htmlFor={ids.name} hint="No real name needed.">
        <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.displayName} className={inputClass} />
      </Field>
      <Field label="Language" htmlFor={ids.lang}>
        <select id={ids.lang} value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>
      <label className="mb-6 flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span>Translate messages automatically</span>
        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={snap.autoTranslate} onChange={(e) => store.setAutoTranslate(e.target.checked)} />
      </label>

      <p className="mb-2 text-[0.9rem] font-medium text-ink-2">Text size</p>
      <div className="mb-5 flex gap-2">
        {(["normal", "large", "xl"] as const).map((t) => (
          <Option key={t} selected={(prefs.text ?? "normal") === t} onClick={() => setPref({ text: t })}>
            {t === "normal" ? "Normal" : t === "large" ? "Large" : "Largest"}
          </Option>
        ))}
      </div>
      <p className="mb-2 text-[0.9rem] font-medium text-ink-2">Appearance</p>
      <div className="mb-6 flex gap-2">
        {(["auto", "light", "dark"] as const).map((t) => (
          <Option key={t} selected={(prefs.theme ?? "auto") === t} onClick={() => setPref({ theme: t })}>
            {t === "auto" ? "Automatic" : t === "light" ? "Light" : "Dark"}
          </Option>
        ))}
      </div>

      <p className="text-[0.85rem] text-ink-3">
        Everyone in this room can read what you post here. Rooms close two days after the trip.{" "}
        <Link href="/" className="font-medium text-ink underline underline-offset-2">
          Leave room
        </Link>
      </p>
      {me ? (
        <p className="mt-4 text-[0.8rem] text-ink-3">
          Your ID: <span className="font-mono select-all">{me.id}</span>
        </p>
      ) : null}
    </Sheet>
  );
}
