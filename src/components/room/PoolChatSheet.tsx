"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Message } from "@nexconn/chat";
import { LIMITS, MSG, noticeContentSchema } from "@/lib/shared/cards";
import { ApiError } from "@/lib/client/api";
import { loadSdk, subscribeChat } from "@/lib/client/chat";
import { Button, Sheet, useToast } from "@/components/ui";
import { UpIcon } from "@/components/icons";
import { useRoom } from "./context";
import { poolDetails, poolTitle } from "./PoolRow";
import { clock } from "./meta";

type ChatLine =
  | { kind: "text"; id: string; at: number; senderId: string; name: string; text: string; pending?: boolean }
  | { kind: "notice"; id: string; at: number; text: string };

const GROUP = 3;

function toLine(m: Message): ChatLine | null {
  if (m.messageType === MSG.notice) {
    const n = noticeContentSchema.safeParse(m.content);
    return n.success ? { kind: "notice", id: m.messageId, at: m.sentTime, text: n.data.text } : null;
  }
  if (m.messageType !== "RC:TxtMsg") return null;
  const c = m.content as { text?: string; senderUserInfo?: { userId?: string; name?: string } };
  const own = c.senderUserInfo?.userId === m.senderUserId;
  const text = typeof c.text === "string" ? c.text.trim().slice(0, 2000) : "";
  return text ? { kind: "text", id: m.messageId, at: m.sentTime, senderId: m.senderUserId, name: (own && c.senderUserInfo?.name?.slice(0, 32)) || "Traveller", text } : null;
}

async function fetchHistory(groupChannelId: string): Promise<ChatLine[]> {
  const { BaseChannel, GroupChannel } = await loadSdk();
  const q = BaseChannel.createMessagesQuery({ channelIdentifier: new GroupChannel(groupChannelId).identifier, startTime: 0, pageSize: 50, isAscending: false });
  const res = await q.loadNextPage();
  if (res.code !== 0) throw new Error(String(res.code));
  return (res.data?.data ?? []).map(toLine).filter((l): l is ChatLine => l !== null);
}

function merge(lines: ChatLine[], add: ChatLine[]): ChatLine[] {
  const map = new Map(lines.map((l) => [l.id, l]));
  for (const l of add) map.set(l.id, l);
  return [...map.values()].sort((a, b) => a.at - b.at);
}

function PoolChat({ groupChannelId }: { groupChannelId: string }) {
  const { snap } = useRoom();
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [text, setText] = useState("");
  const [loadError, setLoadError] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const me = snap.me;

  const load = useCallback(() => {
    fetchHistory(groupChannelId)
      .then((fetched) => {
        setLines((prev) => merge(prev, fetched));
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [groupChannelId]);

  useEffect(() => {
    load();
    return subscribeChat({
      onMessages(messages) {
        const mine = messages.filter((m) => m.channelIdentifier.channelType === GROUP && m.channelIdentifier.channelId === groupChannelId);
        if (mine.length) setLines((prev) => merge(prev, mine.map(toLine).filter((l): l is ChatLine => l !== null)));
      },
    });
  }, [groupChannelId, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  async function send() {
    const body = text.trim();
    if (!body || !me) return;
    setText("");
    const temp: ChatLine = { kind: "text", id: `local-${Date.now()}`, at: Date.now(), senderId: me.id, name: me.name, text: body, pending: true };
    setLines((p) => merge(p, [temp]));
    try {
      const { GroupChannel, SendTextMessageParams } = await loadSdk();
      const res = await new GroupChannel(groupChannelId).sendMessage(
        new SendTextMessageParams({ text: body.slice(0, LIMITS.chatText), senderUserInfo: { userId: me.id, name: me.name, extra: JSON.stringify({ c: me.color, l: me.language }) } }),
      );
      if (res.code !== 0 || !res.data) throw new Error(String(res.code));
      const sent = res.data;
      setLines((p) => merge(p.filter((l) => l.id !== temp.id), [{ ...temp, id: sent.messageId, at: sent.sentTime, pending: false }]));
    } catch {
      setLines((p) => p.filter((l) => l.id !== temp.id));
      setText(body);
    }
  }

  return (
    <div className="flex flex-col">
      <div className="min-h-44" aria-live="polite">
        {loadError ? (
          <p className="text-[0.9rem] text-ink-3">
            Couldn&apos;t load messages.{" "}
            <button type="button" className="underline" onClick={load}>
              Retry
            </button>
          </p>
        ) : lines.length === 0 ? (
          <p className="py-6 text-center text-[0.9rem] text-ink-3">Say where you&apos;ll meet.</p>
        ) : (
          <ol>
            {lines.map((l, i) => {
              if (l.kind === "notice") {
                return (
                  <li key={l.id} className="my-3 text-center text-[0.8rem] text-ink-3">
                    {l.text}
                  </li>
                );
              }
              const mine = l.senderId === me?.id;
              const prev = lines[i - 1];
              const first = !(prev?.kind === "text" && prev.senderId === l.senderId);
              return (
                <li key={l.id} className={`flex flex-col ${mine ? "items-end" : "items-start"} ${first ? "mt-3" : "mt-1"}`}>
                  {first ? (
                    <p className="mb-1 px-1 text-[0.8rem] text-ink-3">
                      {mine ? "" : <span className="font-semibold text-ink-2">{l.name} </span>}
                      {clock(l.at)}
                    </p>
                  ) : null}
                  <p
                    className={`max-w-[85%] rounded-[18px] px-3.5 py-2 leading-snug break-words whitespace-pre-wrap ${mine ? "bg-primary text-primary-ink" : "bg-subtle"} ${l.pending ? "opacity-50" : ""}`}
                    dir="auto"
                  >
                    {l.text}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="sticky bottom-0 mt-4 flex items-end gap-2 bg-bg pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Message this group
        </label>
        <input
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={LIMITS.chatText}
          placeholder="Message this group"
          dir="auto"
          className="h-10 flex-1 rounded-[20px] bg-subtle px-4 outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-[var(--focus)]"
        />
        <button type="submit" disabled={!text.trim()} aria-label="Send" className="grid size-10 place-items-center rounded-full bg-primary text-primary-ink disabled:opacity-30">
          <UpIcon width={20} height={20} strokeWidth={2.2} />
        </button>
      </form>
    </div>
  );
}

export function PoolChatSheet({ poolId, onClose }: { poolId: string | null; onClose: () => void }) {
  const { store, snap } = useRoom();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pool = poolId ? snap.pools[poolId] : undefined;
  if (!pool) return null;
  const closed = pool.state.status === "done" || pool.state.status === "cancelled";
  const names = pool.state.members.map((m) => (m.id === snap.me?.id ? "you" : m.name));

  async function act(action: "release" | "close", body: object = {}, done = "") {
    setBusy(true);
    try {
      await store.poolAction(pool!.poolId, action, body);
      if (done) toast(done);
      if (action === "release") onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={poolTitle(pool)}
      footer={
        !closed ? (
          pool.me.organiser ? (
            <div className="flex gap-2">
              <Button variant="secondary" busy={busy} onClick={() => void act("close", { status: "done" }, "Marked as done")}>
                Mark as done
              </Button>
              <Button variant="danger" busy={busy} onClick={() => void act("close", { status: "cancelled" }, "Cancelled")}>
                Cancel
              </Button>
            </div>
          ) : pool.me.seat ? (
            <Button variant="secondary" busy={busy} onClick={() => void act("release", {}, "You left")}>
              Leave
            </Button>
          ) : null
        ) : null
      }
    >
      <p className="text-[0.9rem] text-ink-2">{poolDetails(pool)}</p>
      <p className="mt-1 text-[0.9rem] text-ink-3">
        In order of joining: {names.join(", ")}.{pool.state.waitlist > 0 ? ` ${pool.state.waitlist} waiting.` : ""}
      </p>
      <div className="my-4 border-t border-line" />
      {pool.groupChannelId ? <PoolChat groupChannelId={pool.groupChannelId} /> : <p className="text-ink-3">Join to see the chat.</p>}
    </Sheet>
  );
}
