"use client";

import type { Message } from "@nexconn/chat";
import {
  intelContentSchema,
  intelStateSchema,
  META,
  MSG,
  noticeContentSchema,
  poolContentSchema,
  poolStateSchema,
  type IntelContent,
  type IntelState,
  type NewIntel,
  type NewPool,
  type PoolContent,
  type PoolState,
  type VoteChoice,
} from "@/lib/shared/cards";
import type { CardDTO, PoolDTO, RoomInfo, RoomStateResponse, SessionResponse } from "@/lib/shared/dto";
import { importVerifyKey, verifyState, type VerifyKey } from "@/lib/shared/signature";
import type { Trip } from "@/lib/shared/trip";
import { api, ApiError } from "./api";
import { ChatConnectError, connectChat, connectionState, loadSdk, metadataToRecord, subscribeChat, type ConnectionState } from "./chat";
import { rememberRoom } from "./recent";
import { readTranslation, saveTranslation } from "./translation-cache";

export type Phase = "starting" | "connecting" | "loading" | "ready" | "error";

export interface Me {
  id: string;
  name: string;
  color: string;
  language: string;
  agentOrg: string | null;
}

export interface Sender {
  id: string;
  name: string;
  color: string;
  lang: string | null;
}

export type TimelineItem =
  | { type: "text"; id: string; sentTime: number; sender: Sender; text: string; status: "sent" | "sending" | "failed" }
  | { type: "intel"; id: string; sentTime: number; cardId: string }
  | { type: "pool"; id: string; sentTime: number; poolId: string }
  | { type: "notice"; id: string; sentTime: number; text: string };

export interface CardEntry {
  cardId: string;
  messageId: string | null;
  content: IntelContent;
  state: IntelState;
  myVote: "confirm" | "dispute" | null;
}

export interface PoolEntry {
  poolId: string;
  messageId: string | null;
  content: PoolContent;
  state: PoolState;
  me: PoolDTO["me"];
  groupChannelId: string | null;
}

export interface Translation {
  status: "pending" | "done" | "failed";
  text?: string;
}

export interface RoomSnapshot {
  phase: Phase;
  error: string | null;
  connection: ConnectionState;
  me: Me | null;
  room: RoomInfo | null;
  writable: boolean;
  members: { total: number; recent: number };
  timeline: TimelineItem[];
  cards: Record<string, CardEntry>;
  pools: Record<string, PoolEntry>;
  translations: Record<string, Translation>;
  history: { hasMore: boolean; loading: boolean };
  autoTranslate: boolean;
}

const PAGE = 40;
const AUTO_TRANSLATE_MAX_CHARS = 280;
const AUTO_TRANSLATE_MAX_AGE = 6 * 60 * 60 * 1000;

const initial: RoomSnapshot = {
  phase: "starting",
  error: null,
  connection: "connecting",
  me: null,
  room: null,
  writable: true,
  members: { total: 0, recent: 0 },
  timeline: [],
  cards: {},
  pools: {},
  translations: {},
  history: { hasMore: false, loading: false },
  autoTranslate: true,
};

function clean(s: unknown, max: number): string {
  return typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "";
}

function readPrefsAutoTranslate(): boolean {
  try {
    const p = JSON.parse(localStorage.getItem("limbo:prefs") ?? "{}") as { autoTranslate?: boolean };
    return p.autoTranslate !== false;
  } catch {
    return true;
  }
}

type HistoryQuery = { hasNext: boolean; loadNextPage(): Promise<{ code: number; data?: { data: Message[] } }> };

export class RoomStore {
  private snap: RoomSnapshot = initial;
  private listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private verifyKey: VerifyKey | null = null;
  private query: HistoryQuery | null = null;
  /** messageId -> card/pool, to route metadata events */
  private byMessage = new Map<string, { kind: "card" | "pool"; refId: string }>();
  private translateQueue = new Set<string>();
  private translateTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private wasOffline = false;
  /** senders already seen, so a new face in the chat triggers a people-count refresh */
  private knownSenders = new Set<string>();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly trip: Trip) {}

  /* ---------------- useSyncExternalStore plumbing ---------------- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  getServerSnapshot = () => initial;

  private set(patch: Partial<RoomSnapshot> | ((s: RoomSnapshot) => Partial<RoomSnapshot>)) {
    if (this.disposed) return;
    const p = typeof patch === "function" ? patch(this.snap) : patch;
    this.snap = { ...this.snap, ...p };
    for (const l of this.listeners) l();
  }

  /* ---------------------------- lifecycle ---------------------------- */

  private starting: Promise<void> | null = null;

  /** Idempotent: React StrictMode mounts twice in development. */
  start(): Promise<void> {
    this.disposed = false;
    // Always (idempotently) resubscribe: a StrictMode unmount may have dropped it mid-start.
    this.ensureSubscribed();
    if (this.snap.phase === "ready") return Promise.resolve();
    this.starting ??= this.run().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async run(): Promise<void> {
    this.set({ phase: "starting", error: null, autoTranslate: readPrefsAutoTranslate() });
    try {
      const session = await api<SessionResponse>("/api/session", { body: {} });
      this.verifyKey = importVerifyKey(session.statePublicKey);
      this.set({ me: session.user });

      const { room } = await api<{ room: RoomInfo }>("/api/rooms/join", { body: { ...this.trip, force: true } });
      this.set({ room, phase: "connecting" });
      rememberRoom({ slug: room.slug, label: room.label, mode: room.mode });

      this.ensureSubscribed();
      await connectChat(session.nexconn.appKey, session.nexconn.token, session.user.id);
      this.set({ connection: connectionState(), phase: "loading" });

      await Promise.all([this.refreshState(), this.loadHistory(true)]);
      this.set({ phase: "ready" });
      this.startPolling();
    } catch (err) {
      this.set({ phase: "error", error: this.describe(err) });
    }
  }

  dispose() {
    this.disposed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.browserOnline);
      window.removeEventListener("offline", this.browserOffline);
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.translateTimer) clearTimeout(this.translateTimer);
    this.translateTimer = null;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** Keep the people count fresh while the room is on screen (people can join and only read). */
  private startPolling() {
    if (this.pollTimer || typeof document === "undefined") return;
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === "visible" && this.snap.connection === "connected") this.scheduleRefresh(0);
    }, 60_000);
  }

  /** Debounced, so a burst of messages in a busy room costs one request per client, not one per message. */
  private scheduleRefresh(delay = 1500) {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshMembers();
    }, delay);
  }

  private browserOnline = () => this.onConnection(connectionState() === "offline" ? "connecting" : connectionState(), true);
  private browserOffline = () => this.onConnection("offline");

  private ensureSubscribed() {
    if (!this.unsubscribe && typeof window !== "undefined") {
      // The browser knows about lost Wi-Fi long before a socket heartbeat does.
      window.addEventListener("online", this.browserOnline);
      window.addEventListener("offline", this.browserOffline);
    }
    this.unsubscribe ??= subscribeChat({
      onMessages: (m) => void this.onMessages(m),
      onMetadata: (m) => void this.onMetadata(m),
      onDeleted: (ids) => this.onDeleted(ids),
      onConnection: (c) => this.onConnection(c),
      onTranslated: (r) => this.onTranslated(r),
    });
  }

  private describe(err: unknown): string {
    if (err instanceof ApiError) return err.message;
    if (err instanceof ChatConnectError) return "Couldn't connect. Check your internet and try again.";
    return "Couldn't open the room. Try again.";
  }

  /* ---------------------------- server state ---------------------------- */

  async refreshState(): Promise<void> {
    const room = this.snap.room;
    if (!room) return;
    const state = await api<RoomStateResponse>(`/api/rooms/${room.id}/state`);
    this.set({ room: state.room, writable: state.writable, members: state.members });
    await Promise.all([...state.cards.map((c) => this.applyCardDTO(c)), ...state.pools.map((p) => this.applyPoolDTO(p))]);
  }

  private async verified<T>(refId: string, meta: Record<string, string> | undefined, parse: (v: unknown) => T | null): Promise<T | null> {
    const s = meta?.[META.state];
    const sig = meta?.[META.sig];
    if (!s || !sig || !this.verifyKey) return null;
    if (!(await verifyState(this.verifyKey, refId, s, sig))) {
      console.warn("[room] rejected state with an invalid signature", refId);
      return null;
    }
    try {
      return parse(JSON.parse(s));
    } catch {
      return null;
    }
  }

  private async applyCardDTO(dto: CardDTO): Promise<void> {
    const content = intelContentSchema.safeParse(dto.content);
    if (!content.success || content.data.cardId !== dto.cardId) return;
    const state = await this.verified(dto.cardId, dto.meta, (v) => intelStateSchema.safeParse(v).data ?? null);
    if (!state) return;
    this.upsertCard({ cardId: dto.cardId, messageId: dto.messageId, content: content.data, state, myVote: dto.myVote });
  }

  private upsertCard(entry: CardEntry, keepVote = false) {
    if (entry.messageId) this.byMessage.set(entry.messageId, { kind: "card", refId: entry.cardId });
    this.set((s) => {
      const prev = s.cards[entry.cardId];
      if (prev && prev.state.ver > entry.state.ver) {
        // Older state arrived late: keep newer state, but accept a newer myVote/messageId.
        return { cards: { ...s.cards, [entry.cardId]: { ...prev, messageId: prev.messageId ?? entry.messageId, myVote: keepVote ? prev.myVote : entry.myVote } } };
      }
      return { cards: { ...s.cards, [entry.cardId]: { ...entry, myVote: keepVote && prev ? prev.myVote : entry.myVote } } };
    });
  }

  private async applyPoolDTO(dto: PoolDTO): Promise<void> {
    const content = poolContentSchema.safeParse(dto.content);
    if (!content.success || content.data.poolId !== dto.poolId) return;
    const state = await this.verified(dto.poolId, dto.meta, (v) => poolStateSchema.safeParse(v).data ?? null);
    if (!state) return;
    this.upsertPool({ poolId: dto.poolId, messageId: dto.messageId, content: content.data, state, me: dto.me, groupChannelId: dto.groupChannelId });
  }

  private upsertPool(entry: PoolEntry) {
    if (entry.messageId) this.byMessage.set(entry.messageId, { kind: "pool", refId: entry.poolId });
    this.set((s) => {
      const prev = s.pools[entry.poolId];
      if (prev && prev.state.ver > entry.state.ver) return {};
      const meId = s.me?.id;
      // Live updates don't carry "me"; derive it from the signed member list.
      const seat = meId ? entry.state.members.some((m) => m.id === meId) : entry.me.seat;
      return {
        pools: {
          ...s.pools,
          [entry.poolId]: {
            ...entry,
            me: { ...entry.me, seat, waitlisted: seat ? false : entry.me.waitlisted },
            groupChannelId: entry.groupChannelId ?? prev?.groupChannelId ?? null,
          },
        },
      };
    });
  }

  /* ---------------------------- messages ---------------------------- */

  private isMine(msg: Message): boolean {
    const room = this.snap.room;
    // Community channel messages: channelIdentifier.channelId is the community ID.
    return Boolean(room && msg.channelIdentifier.channelId === room.channelId && msg.channelIdentifier.channelType === 10);
  }

  private async toItem(msg: Message): Promise<TimelineItem | null> {
    const id = msg.messageId;
    const sentTime = msg.sentTime;
    const meta = metadataToRecord(msg.metadata);
    switch (msg.messageType) {
      case "RC:TxtMsg": {
        const c = msg.content as { text?: string; senderUserInfo?: { userId?: string; name?: string; extra?: string } };
        const text = clean(c.text, 2000);
        if (!text) return null;
        const info = c.senderUserInfo;
        // Trust the display name only if it was attached by the actual sender.
        const own = info?.userId === msg.senderUserId;
        let extra: { c?: string; l?: string } = {};
        try {
          extra = own && info?.extra ? (JSON.parse(info.extra) as typeof extra) : {};
        } catch {
          /* ignore malformed extras */
        }
        return {
          type: "text",
          id,
          sentTime,
          status: "sent" as const,
          text,
          sender: {
            id: msg.senderUserId,
            name: (own && clean(info?.name, 32)) || "Traveller",
            color: /^#[0-9a-f]{6}$/i.test(extra.c ?? "") ? extra.c! : "#6d4c41",
            lang: typeof extra.l === "string" ? extra.l.slice(0, 8) : null,
          },
        };
      }
      case MSG.intel: {
        const content = intelContentSchema.safeParse(msg.content);
        if (!content.success || content.data.author.id !== msg.senderUserId) return null;
        const state = await this.verified(content.data.cardId, meta, (v) => intelStateSchema.safeParse(v).data ?? null);
        if (!state) return null; // unsigned or forged: never shown as a card
        const existing = this.snap.cards[content.data.cardId];
        if (existing?.messageId && existing.messageId !== id) return null; // a copy of a real card
        this.upsertCard({ cardId: content.data.cardId, messageId: id, content: content.data, state, myVote: existing?.myVote ?? null }, true);
        return { type: "intel", id, sentTime, cardId: content.data.cardId };
      }
      case MSG.pool: {
        const content = poolContentSchema.safeParse(msg.content);
        if (!content.success || content.data.organiser.id !== msg.senderUserId) return null;
        const state = await this.verified(content.data.poolId, meta, (v) => poolStateSchema.safeParse(v).data ?? null);
        if (!state) return null;
        const existing = this.snap.pools[content.data.poolId];
        if (existing?.messageId && existing.messageId !== id) return null;
        this.upsertPool({
          poolId: content.data.poolId,
          messageId: id,
          content: content.data,
          state,
          me: existing?.me ?? { seat: false, waitlisted: false, organiser: content.data.organiser.id === this.snap.me?.id },
          groupChannelId: existing?.groupChannelId ?? null,
        });
        return { type: "pool", id, sentTime, poolId: content.data.poolId };
      }
      case MSG.notice: {
        const n = noticeContentSchema.safeParse(msg.content);
        return n.success ? { type: "notice", id, sentTime, text: n.data.text } : null;
      }
      default:
        return null;
    }
  }

  private mergeItems(items: TimelineItem[]) {
    if (items.length === 0) return;
    this.set((s) => {
      const map = new Map(s.timeline.map((i) => [i.id, i]));
      for (const it of items) map.set(it.id, it);
      return { timeline: [...map.values()].sort((a, b) => a.sentTime - b.sentTime || a.id.localeCompare(b.id)) };
    });
  }

  private async onMessages(messages: Message[]) {
    const mine = messages.filter((m) => this.isMine(m));
    if (mine.length === 0) return;
    const items = (await Promise.all(mine.map((m) => this.toItem(m)))).filter((i): i is TimelineItem => i !== null);
    const newFace = mine.some((m) => !this.knownSenders.has(m.senderUserId));
    mine.forEach((m) => this.knownSenders.add(m.senderUserId));
    this.mergeItems(items);
    for (const it of items) this.maybeAutoTranslate(it);
    // A new person, card or pool changes the people count and pool membership.
    if (newFace || items.some((i) => i.type !== "text")) this.scheduleRefresh();
  }

  private async refreshMembers() {
    const room = this.snap.room;
    if (!room) return;
    try {
      const st = await api<RoomStateResponse>(`/api/rooms/${room.id}/state`);
      this.set({ members: st.members });
      // Pool "me" (seat, group chat access) is authoritative from the server.
      await Promise.all(st.pools.map((p) => this.applyPoolDTO(p)));
    } catch {
      /* non-critical */
    }
  }

  private async onMetadata(events: { messageId: string; channelId: string; metadata: Record<string, string> }[]) {
    const room = this.snap.room;
    if (!room) return;
    for (const e of events) {
      if (e.channelId !== room.channelId) continue;
      const ref = this.byMessage.get(e.messageId);
      if (!ref) continue;
      if (ref.kind === "card") {
        const card = this.snap.cards[ref.refId];
        const state = await this.verified(ref.refId, e.metadata, (v) => intelStateSchema.safeParse(v).data ?? null);
        if (card && state) this.upsertCard({ ...card, state }, true);
      } else {
        const pool = this.snap.pools[ref.refId];
        const state = await this.verified(ref.refId, e.metadata, (v) => poolStateSchema.safeParse(v).data ?? null);
        if (pool && state) {
          const hadSeat = pool.me.seat;
          this.upsertPool({ ...pool, state });
          // Promoted from the waitlist: fetch the pool chat ID, which only seat holders get.
          const meId = this.snap.me?.id;
          if (!hadSeat && meId && state.members.some((m) => m.id === meId)) this.scheduleRefresh(0);
        }
      }
    }
  }

  private onDeleted(ids: string[]) {
    const set = new Set(ids);
    this.set((s) => ({ timeline: s.timeline.filter((i) => !set.has(i.id)) }));
  }

  private onConnection(c: ConnectionState, browserBackOnline = false) {
    this.set({ connection: c });
    if (c !== "connected" && !browserBackOnline) {
      this.wasOffline = true;
      return;
    }
    if (browserBackOnline) {
      // The SDK reconnects by itself; if it never noticed the drop, catch up anyway.
      if (connectionState() === "connected") this.set({ connection: "connected" });
      else return;
    }
    if (this.wasOffline && this.snap.phase === "ready") {
      this.wasOffline = false;
      // Catch up on anything missed while offline.
      void this.refreshState().catch(() => {});
      void this.loadHistory(true).catch(() => {});
    }
  }

  /** Load the newest page (fresh = true) or the next older page. */
  async loadHistory(fresh = false): Promise<void> {
    const room = this.snap.room;
    if (!room || this.snap.history.loading) return;
    this.set((s) => ({ history: { ...s.history, loading: true } }));
    try {
      const { BaseChannel, CommunitySubChannel } = await loadSdk();
      if (fresh || !this.query) {
        const channel = new CommunitySubChannel(room.channelId, "RCDefault");
        this.query = BaseChannel.createMessagesQuery({
          channelIdentifier: channel.identifier,
          startTime: 0,
          pageSize: PAGE,
          isAscending: false,
        }) as unknown as HistoryQuery;
      }
      const res = await this.query.loadNextPage();
      if (res.code !== 0) throw new Error(`history ${res.code}`);
      const msgs = res.data?.data ?? [];
      msgs.forEach((m) => this.knownSenders.add(m.senderUserId));
      const items = (await Promise.all(msgs.map((m) => this.toItem(m)))).filter((i): i is TimelineItem => i !== null);
      this.mergeItems(items);
      const recent = items.slice().sort((a, b) => b.sentTime - a.sentTime).slice(0, 15);
      for (const it of recent) this.maybeAutoTranslate(it);
      this.set({ history: { hasMore: this.query.hasNext && msgs.length > 0, loading: false } });
    } catch (err) {
      this.set((s) => ({ history: { ...s.history, loading: false } }));
      if (fresh) throw err;
    }
  }

  /* ---------------------------- actions ---------------------------- */

  async sendText(text: string): Promise<void> {
    const { room, me } = this.snap;
    const body = text.trim();
    if (!room || !me || !body) return;
    const tempId = `local-${crypto.randomUUID()}`;
    const sender: Sender = { id: me.id, name: me.name, color: me.color, lang: me.language };
    this.mergeItems([{ type: "text", id: tempId, sentTime: Date.now(), sender, text: body, status: "sending" }]);
    try {
      const { CommunitySubChannel, SendTextMessageParams } = await loadSdk();
      const channel = new CommunitySubChannel(room.channelId, "RCDefault");
      const res = await channel.sendMessage(
        new SendTextMessageParams({
          text: body,
          senderUserInfo: { userId: me.id, name: me.name, extra: JSON.stringify({ c: me.color, l: me.language }) },
        }),
      );
      if (res.code !== 0 || !res.data) throw new Error(`send ${res.code}`);
      const sent = res.data;
      this.set((s) => ({
        timeline: s.timeline
          .filter((i) => i.id !== tempId)
          .concat([{ type: "text", id: sent.messageId, sentTime: sent.sentTime, sender, text: body, status: "sent" }])
          .sort((a, b) => a.sentTime - b.sentTime || a.id.localeCompare(b.id)),
      }));
    } catch {
      this.set((s) => ({
        timeline: s.timeline.map((i) => (i.id === tempId && i.type === "text" ? { ...i, status: "failed" as const } : i)),
      }));
    }
  }

  async retrySend(tempId: string): Promise<void> {
    const item = this.snap.timeline.find((i) => i.id === tempId);
    if (!item || item.type !== "text") return;
    this.set((s) => ({ timeline: s.timeline.filter((i) => i.id !== tempId) }));
    await this.sendText(item.text);
  }

  discardFailed(tempId: string) {
    this.set((s) => ({ timeline: s.timeline.filter((i) => i.id !== tempId) }));
  }

  async postIntel(input: NewIntel): Promise<void> {
    const room = this.snap.room!;
    const { card } = await api<{ card: CardDTO }>(`/api/rooms/${room.id}/cards`, { body: input });
    await this.applyCardDTO(card);
    if (card.messageId) this.mergeItems([{ type: "intel", id: card.messageId, sentTime: card.content.createdAt, cardId: card.cardId }]);
  }

  async vote(cardId: string, choice: VoteChoice): Promise<void> {
    const room = this.snap.room!;
    const before = this.snap.cards[cardId];
    if (before) this.set((s) => ({ cards: { ...s.cards, [cardId]: { ...before, myVote: choice === "none" ? null : choice } } }));
    try {
      const { card } = await api<{ card: CardDTO }>(`/api/rooms/${room.id}/cards/${cardId}/vote`, { body: { vote: choice } });
      await this.applyCardDTO(card);
    } catch (err) {
      if (before) this.set((s) => ({ cards: { ...s.cards, [cardId]: { ...s.cards[cardId]!, myVote: before.myVote } } }));
      throw err;
    }
  }

  async createPool(input: NewPool): Promise<void> {
    const room = this.snap.room!;
    const { pool } = await api<{ pool: PoolDTO }>(`/api/rooms/${room.id}/pools`, { body: input });
    await this.applyPoolDTO(pool);
    if (pool.messageId) this.mergeItems([{ type: "pool", id: pool.messageId, sentTime: pool.content.createdAt, poolId: pool.poolId }]);
  }

  async poolAction(poolId: string, action: "claim" | "release" | "close", body: object = {}): Promise<"seat" | "waitlisted" | "already" | null> {
    const room = this.snap.room!;
    const res = await api<{ pool: PoolDTO; outcome?: "seat" | "waitlisted" | "already" }>(`/api/rooms/${room.id}/pools/${poolId}/${action}`, { body });
    await this.applyPoolDTO(res.pool);
    return res.outcome ?? null;
  }

  async report(targetType: "message" | "card" | "pool" | "user", targetId: string, reason: string): Promise<void> {
    const room = this.snap.room!;
    await api(`/api/rooms/${room.id}/reports`, { body: { targetType, targetId, reason } });
  }

  async updateMe(patch: { name?: string; language?: string; color?: string }): Promise<void> {
    const res = await api<{ user: { name: string; color: string; language: string } }>("/api/me", { method: "PATCH", body: patch });
    const languageChanged = patch.language && patch.language !== this.snap.me?.language;
    this.set((s) => ({ me: s.me ? { ...s.me, ...res.user } : s.me, ...(languageChanged ? { translations: {} } : {}) }));
    if (languageChanged) for (const it of this.snap.timeline.slice(-15)) this.maybeAutoTranslate(it);
  }

  setAutoTranslate(on: boolean) {
    this.set({ autoTranslate: on });
    try {
      const p = JSON.parse(localStorage.getItem("limbo:prefs") ?? "{}") as Record<string, unknown>;
      localStorage.setItem("limbo:prefs", JSON.stringify({ ...p, autoTranslate: on }));
    } catch {
      /* preference only */
    }
    if (on) for (const it of this.snap.timeline.slice(-15)) this.maybeAutoTranslate(it);
  }

  /* ---------------------------- translation ---------------------------- */

  /** Text and language of an item, if it can be translated. */
  translatable(item: TimelineItem): { text: string; lang: string | null } | null {
    if (item.type === "text") return { text: item.text, lang: item.sender.lang };
    if (item.type === "intel") {
      const c = this.snap.cards[item.cardId]?.content;
      if (!c) return null;
      return { text: c.detail ? (/[.!?。।]$/.test(c.text) ? `${c.text} ${c.detail}` : `${c.text}. ${c.detail}`) : c.text, lang: c.lang ?? null };
    }
    return null;
  }

  private maybeAutoTranslate(item: TimelineItem) {
    const me = this.snap.me;
    if (!this.snap.autoTranslate || !me || item.id.startsWith("local-")) return;
    const t = this.translatable(item);
    if (!t || !t.lang || t.lang === me.language) return;
    if (item.type === "text" && item.sender.id === me.id) return;
    if (t.text.length > AUTO_TRANSLATE_MAX_CHARS || Date.now() - item.sentTime > AUTO_TRANSLATE_MAX_AGE) return;
    this.translate(item.id);
  }

  /** Request a translation into my language (cached; batched up to 10 per request). */
  translate(messageId: string) {
    const me = this.snap.me;
    if (!me || this.snap.translations[messageId]?.status === "pending" || this.snap.translations[messageId]?.status === "done") return;
    const cached = readTranslation(me.language, messageId);
    if (cached) {
      this.set((s) => ({ translations: { ...s.translations, [messageId]: { status: "done", text: cached } } }));
      return;
    }
    this.set((s) => ({ translations: { ...s.translations, [messageId]: { status: "pending" } } }));
    this.translateQueue.add(messageId);
    this.translateTimer ??= setTimeout(() => void this.flushTranslations(), 150);
  }

  private async flushTranslations() {
    this.translateTimer = null;
    const me = this.snap.me;
    const ids = [...this.translateQueue].slice(0, 10);
    ids.forEach((id) => this.translateQueue.delete(id));
    if (this.translateQueue.size > 0) this.translateTimer = setTimeout(() => void this.flushTranslations(), 150);
    if (!me || ids.length === 0) return;
    const { NCEngine, TranslateMessageParam } = await loadSdk();
    const list = ids
      .map((id) => {
        const item = this.snap.timeline.find((i) => i.id === id);
        const t = item ? this.translatable(item) : null;
        return t ? new TranslateMessageParam(id, "auto", me.language, t.text) : null;
      })
      .filter((p): p is InstanceType<typeof TranslateMessageParam> => p !== null);
    const fail = (which: string[]) =>
      this.set((s) => ({
        translations: { ...s.translations, ...Object.fromEntries(which.map((id) => [id, { status: "failed" as const }])) },
      }));
    if (list.length === 0) return fail(ids);
    try {
      const res = await NCEngine.translateModule.translateMessages({ list, force: false });
      if (res.code !== 0) fail(ids);
      // Otherwise results arrive through onTranslated. Time out quietly if they never do.
      setTimeout(() => {
        const stuck = ids.filter((id) => this.snap.translations[id]?.status === "pending");
        if (stuck.length) fail(stuck);
      }, 15_000);
    } catch {
      fail(ids);
    }
  }

  private onTranslated(results: { messageId: string; text: string | null; ok: boolean }[]) {
    const me = this.snap.me;
    const patch: Record<string, Translation> = {};
    for (const r of results) {
      if (!(r.messageId in this.snap.translations)) continue;
      patch[r.messageId] = r.ok && r.text ? { status: "done", text: r.text } : { status: "failed" };
      if (r.ok && r.text && me) saveTranslation(me.language, r.messageId, r.text);
    }
    if (Object.keys(patch).length) this.set((s) => ({ translations: { ...s.translations, ...patch } }));
  }
}
