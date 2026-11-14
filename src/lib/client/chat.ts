"use client";

/**
 * Thin wrapper around the Nexconn Web Chat SDK.
 *
 * - The SDK is browser-only, so it is imported lazily on first use.
 * - initialize() and connect() happen once per page lifetime, as the docs require;
 *   the SDK reconnects by itself after network drops.
 * - Custom message types are registered before connect().
 * - Events fan out to any number of subscribers (room view, pool chat sheet).
 */
import type { Message } from "@nexconn/chat";
import { MSG } from "@/lib/shared/cards";

type Sdk = typeof import("@nexconn/chat");

export type ConnectionState = "connecting" | "connected" | "offline";

export interface ChatEvents {
  onMessages?(messages: Message[]): void;
  /** Metadata (signed live state) changed on these messages. */
  onMetadata?(messages: { messageId: string; channelId: string; metadata: Record<string, string> }[]): void;
  onDeleted?(messageIds: string[]): void;
  onConnection?(state: ConnectionState, code?: number): void;
  onTranslated?(results: { messageId: string; text: string | null; ok: boolean }[]): void;
}

let sdkPromise: Promise<Sdk> | null = null;
let initialized = false;
let connectedAs: string | null = null;
let connecting: Promise<void> | null = null;
let connection: ConnectionState = "connecting";
const subscribers = new Set<ChatEvents>();

export function loadSdk(): Promise<Sdk> {
  sdkPromise ??= import("@nexconn/chat");
  return sdkPromise;
}

function emit<K extends keyof ChatEvents>(key: K, ...args: Parameters<NonNullable<ChatEvents[K]>>) {
  for (const s of subscribers) {
    const fn = s[key] as ((...a: typeof args) => void) | undefined;
    try {
      fn?.(...args);
    } catch (err) {
      console.error("[chat] subscriber failed", err);
    }
  }
}

function metadataToRecord(meta: unknown): Record<string, string> {
  if (meta instanceof Map) return Object.fromEntries(meta as Map<string, string>);
  if (meta && typeof meta === "object") return meta as Record<string, string>;
  return {};
}

async function init(appKey: string): Promise<Sdk> {
  const sdk = await loadSdk();
  if (initialized) return sdk;
  const { NCEngine, AreaCode, LogLevel, ConnectionStatusHandler, MessageHandler, TranslateHandler, ConnectionStatus } = sdk;

  NCEngine.initialize({
    appKey,
    areaCode: AreaCode.SG,
    // The SDK logs routine connection steps at WARN; keep the console for real problems.
    logLevel: LogLevel.ERROR,
  });
  NCEngine.registerCustomMessages([
    { messageType: MSG.intel, isPersisted: true, isCounted: true },
    { messageType: MSG.pool, isPersisted: true, isCounted: true },
    { messageType: MSG.notice, isPersisted: true, isCounted: false },
  ]);

  NCEngine.addConnectionStatusHandler(
    "limbo",
    new ConnectionStatusHandler({
      onConnectionStatusChanged({ status, code }) {
        connection = status === ConnectionStatus.CONNECTED ? "connected" : status === ConnectionStatus.CONNECTING ? "connecting" : "offline";
        emit("onConnection", connection, code);
      },
    }),
  );

  const metadataEvent = (messages: Message[]) =>
    emit(
      "onMetadata",
      messages.map((m) => ({ messageId: m.messageId, channelId: m.channelIdentifier.channelId, metadata: metadataToRecord(m.metadata) })),
    );

  NCEngine.addMessageHandler(
    "limbo",
    new MessageHandler({
      onMessageReceived({ messages }) {
        emit("onMessages", messages);
      },
      onCommunityChannelMessageMetadataChanged({ messages }) {
        metadataEvent(messages);
      },
      onMessageMetadataUpdated({ messageId, channelIdentifier, metadata }) {
        emit("onMetadata", [{ messageId, channelId: channelIdentifier.channelId, metadata }]);
      },
      onMessageDeleted({ messages }) {
        emit(
          "onDeleted",
          messages.map((m) => m.messageId),
        );
      },
    }),
  );

  NCEngine.addTranslateHandler(
    "limbo",
    new TranslateHandler({
      onTranslationCompleted({ results }) {
        emit(
          "onTranslated",
          results.map((r) => ({
            messageId: r.identifier,
            ok: r.code === 0 && Boolean(r.translateInfo?.translatedText),
            text: r.translateInfo?.translatedText ?? null,
          })),
        );
      },
    }),
  );

  initialized = true;
  return sdk;
}

export class ChatConnectError extends Error {
  constructor(readonly code: number) {
    super(`Could not connect to chat (code ${code})`);
  }
}

/** Connect as `userId`. Safe to call repeatedly; concurrent calls share one attempt. */
export async function connectChat(appKey: string, token: string, userId: string): Promise<void> {
  const sdk = await init(appKey);
  if (connectedAs === userId) return;
  if (connecting) return connecting;
  connecting = (async () => {
    if (connectedAs && connectedAs !== userId) await sdk.NCEngine.disconnect();
    connection = "connecting";
    emit("onConnection", connection);
    const res = await sdk.NCEngine.connect({ token });
    if (res.code !== 0) {
      connection = "offline";
      emit("onConnection", connection, res.code);
      throw new ChatConnectError(res.code);
    }
    connectedAs = userId;
    connection = "connected";
    emit("onConnection", connection);
  })().finally(() => {
    connecting = null;
  });
  return connecting;
}

export function connectionState(): ConnectionState {
  return connection;
}

export function subscribeChat(events: ChatEvents): () => void {
  subscribers.add(events);
  return () => subscribers.delete(events);
}

export { metadataToRecord };
