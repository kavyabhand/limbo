/** Shapes exchanged between our API and the browser. Imported by both sides so they cannot drift. */
import type { IntelContent, PoolContent } from "./cards.ts";
import type { TripMode } from "./trip.ts";

export interface RoomInfo {
  id: string;
  key: string;
  slug: string;
  channelId: string;
  mode: TripMode;
  code: string;
  date: string;
  label: string;
  isDemo: boolean;
  status: "open" | "read_only" | "archived";
}

/** A card: content plus signed state, verified in the browser exactly like live updates. */
export interface CardDTO {
  cardId: string;
  messageId: string | null;
  content: IntelContent;
  meta: Record<string, string>;
  myVote: "confirm" | "dispute" | null;
}

export interface PoolDTO {
  poolId: string;
  messageId: string | null;
  content: PoolContent;
  meta: Record<string, string>;
  me: { seat: boolean; waitlisted: boolean; organiser: boolean };
  /** Only revealed to people holding a seat. */
  groupChannelId: string | null;
}

export interface SessionResponse {
  user: { id: string; name: string; color: string; language: string; agentOrg: string | null };
  nexconn: { appKey: string; token: string };
  statePublicKey: string;
}

export interface RoomStateResponse {
  room: RoomInfo;
  writable: boolean;
  members: { total: number; recent: number };
  cards: CardDTO[];
  pools: PoolDTO[];
  serverTime: number;
}
