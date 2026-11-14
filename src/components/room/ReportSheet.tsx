"use client";

import { useState } from "react";
import { ApiError } from "@/lib/client/api";
import { Button, Sheet, useToast } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { useRoom } from "./context";

const REASONS = [
  { id: "false_info", label: "It's false or misleading" },
  { id: "scam", label: "It's a scam" },
  { id: "abuse", label: "It's abusive" },
  { id: "personal_info", label: "It shares someone's personal details" },
  { id: "spam", label: "It's spam" },
  { id: "other", label: "Something else" },
] as const;

export function ReportSheet({ target, onClose }: { target: { type: "message" | "card" | "pool"; id: string; label: string } | null; onClose: () => void }) {
  const { store } = useRoom();
  const toast = useToast();
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!target || !reason) return;
    setBusy(true);
    try {
      await store.report(target.type, target.id, reason);
      toast("Thanks, we'll take a look");
      setReason(null);
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't send. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title="Report"
      footer={
        <Button busy={busy} disabled={!reason} onClick={() => void submit()}>
          Send report
        </Button>
      }
    >
      {target ? (
        <p className="mb-3 line-clamp-2 text-[0.9rem] text-ink-3" dir="auto">
          “{target.label}”
        </p>
      ) : null}
      <ul role="radiogroup" aria-label="Reason" className="divide-y divide-line">
        {REASONS.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              role="radio"
              aria-checked={reason === r.id}
              onClick={() => setReason(r.id)}
              className="flex min-h-12 w-full items-center justify-between text-left"
            >
              {r.label}
              {reason === r.id ? <CheckIcon width={18} height={18} strokeWidth={2.4} /> : null}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
