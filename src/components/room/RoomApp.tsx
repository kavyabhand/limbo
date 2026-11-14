"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { RoomStore } from "@/lib/client/room-store";
import { displayCode, displayDate, type Trip } from "@/lib/shared/trip";
import { Button, ToastProvider } from "@/components/ui";
import { BackIcon, MoreIcon, ShareIcon } from "@/components/icons";
import { RoomContext, type RoomCtx } from "./context";
import { Composer } from "./Composer";
import { CreatePoolSheet } from "./CreatePoolSheet";
import { DemoDirector } from "./DemoDirector";
import { NowPanel, StatusHeader } from "./NowPanel";
import { PoolChatSheet } from "./PoolChatSheet";
import { PostFactSheet } from "./PostFactSheet";
import { ReportSheet } from "./ReportSheet";
import { SettingsSheet } from "./SettingsSheet";
import { ShareSheet } from "./ShareSheet";
import { Timeline } from "./Timeline";

export function RoomApp({ trip }: { trip: Trip }) {
  const [store] = useState(() => new RoomStore(trip));
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState<null | "fact" | "pool" | "settings" | "share">(null);
  const [poolOpen, setPoolOpen] = useState<string | null>(null);
  const [report, setReport] = useState<Parameters<RoomCtx["openReport"]>[0] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [statusInView, setStatusInView] = useState(true);

  useEffect(() => {
    void store.start();
    return () => store.dispose();
  }, [store]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // On phones the status scrolls away above the chat; a slim bar takes over as soon as the headline is out of view.
  useEffect(() => {
    const el = statusRef.current;
    const root = scrollRef.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(([e]) => setStatusInView(Boolean(e?.isIntersecting)), { root, threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [snap.phase]);

  // Phones open at the top, so the answer to "what's happening?" comes first. On wider screens the status lives in
  // the sidebar, so open at the newest message.
  useEffect(() => {
    if (snap.phase !== "ready") return;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = window.matchMedia("(min-width: 1024px)").matches ? el.scrollHeight : 0;
    });
  }, [snap.phase]);

  const ctx: RoomCtx = { store, snap, now, openPool: setPoolOpen, openReport: setReport };
  const code = displayCode(trip);
  const date = displayDate(trip.date, now);

  if (snap.phase !== "ready") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
        <p className="text-[1.75rem] font-semibold tracking-tight">{code}</p>
        <p className="mt-1 text-ink-3">{date}</p>
        {snap.phase === "error" ? (
          <div className="mt-8 w-full">
            <p role="alert" className="mb-4 text-ink-2">
              {snap.error}
            </p>
            <Button onClick={() => void store.start()}>Try again</Button>
            <Link href="/" className="mt-4 inline-block text-[0.9rem] text-ink-3 underline underline-offset-4">
              Back
            </Link>
          </div>
        ) : (
          <p className="mt-8 text-[0.9rem] text-ink-3" aria-live="polite">
            {snap.phase === "loading" ? "Catching up…" : "Joining…"}
          </p>
        )}
      </main>
    );
  }

  const here = snap.members.recent || snap.members.total;
  const iconBtn = "grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-subtle";

  return (
    <RoomContext.Provider value={ctx}>
      <ToastProvider>
        <div className="flex h-dvh flex-col">
          <header className="flex items-center gap-1 border-b border-line px-2 pt-[env(safe-area-inset-top)]">
            <Link href="/" aria-label="Back" className={iconBtn}>
              <BackIcon />
            </Link>
            <div className="min-w-0 flex-1 py-2">
              <h1 className="truncate text-[1.05rem] leading-tight font-semibold">{code}</h1>
              <p className="truncate text-[0.8rem] text-ink-3">
                {date} · {here} {here === 1 ? "person" : "people"}
                {snap.connection === "offline" ? " · offline" : snap.connection === "connecting" ? " · reconnecting…" : ""}
              </p>
            </div>
            <button type="button" onClick={() => setSheet("share")} aria-label="Invite others" className={iconBtn}>
              <ShareIcon />
            </button>
            <button type="button" onClick={() => setSheet("settings")} aria-label="Settings" className={iconBtn}>
              <MoreIcon />
            </button>
          </header>

          {snap.room?.isDemo ? <DemoDirector /> : null}
          {snap.connection === "offline" ? (
            <p role="status" className="border-b border-line px-4 py-2 text-[0.85rem] text-ink-2">
              You&apos;re offline. Messages will catch up when you reconnect.
            </p>
          ) : null}

          <div className="flex min-h-0 flex-1">
            <aside aria-label="What's happening" className="hidden w-[380px] shrink-0 overflow-y-auto border-r border-line px-6 py-6 lg:block">
              <NowPanel />
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1">
                {!statusInView ? (
                  <button
                    type="button"
                    onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                    aria-label="Show all updates"
                    className="absolute inset-x-0 top-0 z-10 border-b border-line bg-bg/95 px-4 py-2 text-left backdrop-blur lg:hidden"
                  >
                    <StatusHeader compact />
                  </button>
                ) : null}
                <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain">
                  <div className="mx-auto max-w-2xl px-4">
                    <div className="border-b border-line pt-5 pb-5 lg:hidden">
                      <NowPanel statusRef={statusRef} />
                    </div>
                    <Timeline scrollRef={scrollRef} />
                  </div>
                </div>
              </div>
              <div className="mx-auto w-full max-w-2xl">
                <Composer onPostFact={() => setSheet("fact")} onCreatePool={() => setSheet("pool")} />
              </div>
            </div>
          </div>
        </div>

        <PostFactSheet open={sheet === "fact"} onClose={() => setSheet(null)} />
        <CreatePoolSheet open={sheet === "pool"} onClose={() => setSheet(null)} onCreated={(id) => setPoolOpen(id)} />
        {sheet === "settings" ? <SettingsSheet open onClose={() => setSheet(null)} /> : null}
        <ShareSheet open={sheet === "share"} onClose={() => setSheet(null)} />
        <PoolChatSheet poolId={poolOpen} onClose={() => setPoolOpen(null)} />
        <ReportSheet target={report} onClose={() => setReport(null)} />
      </ToastProvider>
    </RoomContext.Provider>
  );
}
