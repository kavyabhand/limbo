"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LIMITS } from "@/lib/shared/cards";
import { useHydrated } from "@/lib/client/useHydrated";
import { MicIcon, PlusIcon, UpIcon } from "@/components/icons";
import { useRoom } from "./context";
import { looksLikeContactDetails } from "./meta";

// Minimal typing for the Web Speech API (not in lib.dom for all targets).
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type SpeechCtor = new () => SpeechRecognitionLike;

const SPEECH_LOCALE: Record<string, string> = {
  en: "en-IN", hi: "hi-IN", bn: "bn-IN", ta: "ta-IN", te: "te-IN", mr: "mr-IN",
  es: "es-ES", fr: "fr-FR", de: "de-DE", ar: "ar-SA", zh: "zh-CN", ja: "ja-JP",
};

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function Composer({ onPostFact, onCreatePool }: { onPostFact: () => void; onCreatePool: () => void }) {
  const { store, snap } = useRoom();
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [warnContact, setWarnContact] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const menuId = useId();
  const hydrated = useHydrated();
  const canSpeak = hydrated && speechCtor() !== null;

  useEffect(() => () => recRef.current?.stop(), []);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  // Close the + menu on outside click or Escape.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (!snap.writable) {
    return <p className="border-t border-line px-4 py-3 text-center text-[0.9rem] text-ink-3">This trip has ended. The room is read-only.</p>;
  }

  function send(force = false) {
    const body = text.trim();
    if (!body) return;
    if (!force && looksLikeContactDetails(body)) {
      setWarnContact(true);
      return;
    }
    setWarnContact(false);
    setText("");
    void store.sendText(body.slice(0, LIMITS.chatText));
    areaRef.current?.focus();
  }

  function toggleMic() {
    setMicError(null);
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = SPEECH_LOCALE[snap.me?.language ?? "en"] ?? "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    const base = text ? `${text.trimEnd()} ` : "";
    rec.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i]?.[0]?.transcript ?? "";
      setText(base + transcript);
    };
    rec.onerror = (e) => setMicError(e.error === "not-allowed" ? "Microphone access is blocked in your browser settings." : "Didn't catch that. Try again.");
    rec.onend = () => {
      setListening(false);
      areaRef.current?.focus();
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const hasText = text.trim().length > 0;

  return (
    <div className="relative border-t border-line bg-bg px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.6rem)]">
      {warnContact ? (
        <p role="alert" className="mb-2 px-1 text-[0.85rem] text-ink-2">
          Everyone here can read this. Share numbers privately, in a ride or room chat.{" "}
          <button type="button" className="font-semibold text-ink underline" onClick={() => send(true)}>
            Send anyway
          </button>
        </p>
      ) : null}
      {micError ? (
        <p role="alert" className="mb-2 px-1 text-[0.85rem] text-danger">
          {micError}
        </p>
      ) : null}

      <div ref={menuRef} className="relative">
        {menu ? (
          <div id={menuId} role="menu" className="fade-up absolute bottom-full left-0 z-20 mb-2 w-72 rounded-2xl bg-bg p-1.5 shadow-xl ring-1 ring-line">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                onPostFact();
              }}
              className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-subtle"
            >
              <span className="block font-medium">Post an update</span>
              <span className="block text-[0.85rem] text-ink-3">A delay, gate change, desk, food…</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                onCreatePool();
              }}
              className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-subtle"
            >
              <span className="block font-medium">Share a cab or room</span>
              <span className="block text-[0.85rem] text-ink-3">Split the cost with others on this trip</span>
            </button>
          </div>
        ) : null}

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-label="Post an update or share a ride"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-controls={menu ? menuId : undefined}
            className={`grid size-10 shrink-0 place-items-center rounded-full transition-transform ${menu ? "rotate-45 bg-primary text-primary-ink" : "bg-subtle text-ink"}`}
          >
            <PlusIcon width={20} height={20} />
          </button>
          <label htmlFor={inputId} className="sr-only">
            Message everyone on this trip
          </label>
          <textarea
            id={inputId}
            ref={areaRef}
            rows={1}
            value={text}
            maxLength={LIMITS.chatText}
            onChange={(e) => {
              setText(e.target.value);
              setWarnContact(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={listening ? "Listening…" : "Message"}
            enterKeyHint="send"
            dir="auto"
            className="max-h-33 min-h-10 flex-1 resize-none rounded-[20px] bg-subtle px-4 py-2 text-base leading-6 outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-[var(--focus)]"
          />
          {hasText || !canSpeak ? (
            <button
              type="submit"
              disabled={!hasText}
              aria-label="Send"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-ink disabled:opacity-30"
            >
              <UpIcon width={20} height={20} strokeWidth={2.2} />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleMic}
              aria-pressed={listening}
              aria-label={listening ? "Stop voice input" : "Speak your message"}
              className={`grid size-10 shrink-0 place-items-center rounded-full ${listening ? "bg-danger text-on-color" : "bg-subtle text-ink"}`}
            >
              <MicIcon width={20} height={20} />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
