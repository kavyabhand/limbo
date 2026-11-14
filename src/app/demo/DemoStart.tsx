"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/client/api";
import { Button } from "@/components/ui";
import type { RoomInfo } from "@/lib/shared/dto";

/** Creates a private demo room for this visitor and sends them into it. */
export function DemoStart() {
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function start() {
    setError(null);
    try {
      const { room } = await api<{ room: RoomInfo }>("/api/demo", { body: {} });
      window.location.replace(`/r/${room.slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the demo. Try again.");
    }
  }

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in development
    started.current = true;
    void start();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <p className="text-[1.5rem] font-semibold tracking-tight">Opening a demo room</p>
      <p className="mt-2 text-ink-2">A delayed flight with a few simulated passengers. Everything you do in it works for real.</p>
      {error ? (
        <div className="mt-8 w-full">
          <p role="alert" className="mb-4 text-danger">
            {error}
          </p>
          <Button onClick={() => void start()}>Try again</Button>
        </div>
      ) : (
        <p className="mt-8 text-[0.9rem] text-ink-3">One moment…</p>
      )}
      <Link href="/" className="mt-6 text-[0.9rem] text-ink-3 underline underline-offset-4">
        Back
      </Link>
    </main>
  );
}
