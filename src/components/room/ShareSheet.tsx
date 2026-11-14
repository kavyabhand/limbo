"use client";

import { useState } from "react";
import { Button, Sheet, useToast } from "@/components/ui";
import { useRoom } from "./context";
import { QrCode } from "./QrCode";

export function ShareSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snap } = useRoom();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const room = snap.room;
  if (!room) return null;
  const url = typeof window === "undefined" ? `/r/${room.slug}` : `${window.location.origin}/r/${room.slug}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't copy. Press and hold the link to copy it.", "error");
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite others on this trip"
      footer={
        canShare ? (
          <Button onClick={() => void navigator.share({ title: room.label, text: `Room for ${room.label} on Limbo`, url }).catch(() => {})}>Share link</Button>
        ) : (
          <Button onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</Button>
        )
      }
    >
      <div className="flex flex-col items-center gap-4 pt-2">
        <QrCode value={url} size={200} label={`QR code for the ${room.label} room`} />
        <p className="text-center text-[0.9rem] text-ink-2">Anyone can scan this to join. No app or sign-up.</p>
        <button type="button" onClick={() => void copy()} className="w-full truncate rounded-xl bg-subtle px-4 py-3 text-left text-[0.9rem] text-ink-2" title="Copy link">
          {url}
        </button>
        <a href={`/r/${room.slug}/poster`} target="_blank" rel="noopener" className="text-[0.9rem] font-medium underline underline-offset-4">
          Print a poster
        </a>
      </div>
    </Sheet>
  );
}
