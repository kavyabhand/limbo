import "server-only";
import { channelIdFor, roomKey, roomSlug, tripLabel, type Trip, type TripMode } from "@/lib/shared/trip";
import type { RoomInfo } from "@/lib/shared/dto";
import { db } from "./db";
import { createCommunityChannel, joinCommunityChannel, NexconnError } from "./nexconn";
import { HttpError } from "./http";

export interface RoomRow {
  id: string;
  room_key: string;
  mode: TripMode;
  code: string;
  travel_date: string;
  channel_id: string;
  channel_ready: boolean;
  is_demo: boolean;
  status: "open" | "read_only" | "archived";
  created_at: Date;
}


export function toRoomInfo(row: RoomRow): RoomInfo {
  const trip: Trip = { mode: row.mode, code: row.code, date: row.travel_date };
  return {
    id: row.id,
    key: row.room_key,
    slug: roomSlug(trip),
    channelId: row.channel_id,
    mode: row.mode,
    code: row.code,
    date: row.travel_date,
    label: tripLabel(trip, Date.now()),
    isDemo: row.is_demo,
    status: row.status,
  };
}

const ROOM_COLUMNS = (sql: ReturnType<typeof db>) => sql`id, room_key, mode, code, to_char(travel_date, 'YYYY-MM-DD') as travel_date,
  channel_id, channel_ready, is_demo, status, created_at`;

export async function findRoomByKey(key: string): Promise<RoomRow | null> {
  const sql = db();
  const rows = await sql<RoomRow[]>`select ${ROOM_COLUMNS(sql)} from rooms where room_key = ${key}`;
  return rows[0] ?? null;
}

export async function findRoomById(id: string): Promise<RoomRow | null> {
  const sql = db();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await sql<RoomRow[]>`select ${ROOM_COLUMNS(sql)} from rooms where id = ${id}`;
  return rows[0] ?? null;
}

/** Find the room for a trip, creating the database row on first request. */
export async function getOrCreateRoom(trip: Trip, userId: string, opts: { demo?: boolean; channelId?: string } = {}): Promise<RoomRow> {
  const sql = db();
  const key = roomKey(trip);
  const channelId = opts.channelId ?? channelIdFor(trip);
  await sql`
    insert into rooms (room_key, mode, code, travel_date, channel_id, is_demo, created_by)
    values (${key}, ${trip.mode}, ${trip.code}, ${trip.date}, ${channelId}, ${opts.demo ?? false}, ${userId})
    on conflict (room_key) do nothing`;
  const room = await findRoomByKey(key);
  if (!room) throw new Error("room upsert failed");
  return room;
}

/**
 * Make sure the Nexconn community channel exists and the user is a member.
 * Idempotent and safe under concurrency: if two people open a brand-new room at
 * once, one creates the channel and the other falls back to joining it.
 */
export async function ensureMembership(room: RoomRow, userId: string): Promise<{ firstVisit: boolean }> {
  const sql = db();
  const already = await sql`
    update room_members set last_seen_at = now() where room_id = ${room.id} and user_id = ${userId} returning 1`;
  if (already.length > 0) return { firstVisit: false };

  if (room.status !== "open") throw new HttpError(410, "room_closed", "This trip has ended. The room is now read-only.");

  const name = tripLabel({ mode: room.mode, code: room.code, date: room.travel_date }, Date.now());
  if (!room.channel_ready) {
    try {
      await createCommunityChannel(room.channel_id, name, userId);
    } catch (createErr) {
      // Most likely someone else created it a moment ago: joining settles it either way.
      try {
        await joinCommunityChannel(room.channel_id, userId);
      } catch {
        throw createErr;
      }
    }
    await sql`update rooms set channel_ready = true where id = ${room.id}`;
  } else {
    try {
      await joinCommunityChannel(room.channel_id, userId);
    } catch (err) {
      // Joining twice is harmless; only surface real failures.
      if (!(err instanceof NexconnError) || err.httpStatus >= 500 || err.httpStatus === 0) throw err;
      console.warn(`[rooms] join returned code=${err.code}; continuing`);
    }
  }

  await sql`
    insert into room_members (room_id, user_id) values (${room.id}, ${userId})
    on conflict (room_id, user_id) do update set last_seen_at = now()`;
  return { firstVisit: true };
}

export async function memberCount(roomId: string): Promise<{ total: number; recent: number }> {
  const [row] = await db()<{ total: number; recent: number }[]>`
    select count(*)::int as total,
           count(*) filter (where last_seen_at > now() - interval '2 hours')::int as recent
    from room_members where room_id = ${roomId}`;
  return row ?? { total: 0, recent: 0 };
}

export async function requireMember(roomId: string, userId: string): Promise<RoomRow> {
  const room = await findRoomById(roomId);
  if (!room) throw new HttpError(404, "no_room", "That room doesn't exist.");
  const rows = await db()`select 1 from room_members where room_id = ${room.id} and user_id = ${userId}`;
  if (rows.length === 0) throw new HttpError(403, "not_member", "Join the room first.");
  return room;
}

/** Rooms become read-only two days after the travel date. */
export function isWritable(room: RoomRow, now = Date.now()): boolean {
  if (room.status !== "open") return false;
  const travel = Date.parse(`${room.travel_date}T00:00:00Z`);
  return now < travel + 3 * 86_400_000;
}

export function assertWritable(room: RoomRow): void {
  if (!isWritable(room)) throw new HttpError(410, "room_closed", "This trip has ended. The room is now read-only.");
}
