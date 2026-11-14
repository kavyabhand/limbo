import "server-only";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { looksLikeContactDetails, MSG, type NewPool, type NoticeContent, type PoolContent, type PoolState, type PoolStatus } from "@/lib/shared/cards";
import { authorOf } from "./cards";
import type { PoolDTO } from "@/lib/shared/dto";
import { db } from "./db";
import { HttpError, rateLimit, track } from "./http";
import {
  createGroupChannel,
  joinGroupChannel,
  leaveGroupChannel,
  sendCommunityMessage,
  sendGroupMessage,
  setCommunityMessageMetadata,
} from "./nexconn";
import type { RoomRow } from "./rooms";
import type { User } from "./session";
import { signedMetadata } from "./signing";

type Tx = postgres.TransactionSql<Record<string, never>>;
type Runner = ReturnType<typeof db> | Tx;

interface PoolRow {
  id: string;
  room_id: string;
  organiser_id: string;
  kind: PoolContent["kind"];
  capacity: number;
  content: PoolContent;
  status: PoolStatus;
  message_id: string | null;
  group_channel_id: string;
  ver: number;
}


const KIND_LABEL: Record<PoolContent["kind"], string> = { cab: "Cab", hotel: "Hotel room", meal: "Meal" };

async function loadState(runner: Runner, pool: PoolRow): Promise<PoolState> {
  // Both a pool and a transaction expose the same tagged-template query API.
  const sql = runner as ReturnType<typeof db>;
  const members = await sql<{ id: string; name: string; color: string }[]>`
    select u.id, u.display_name as name, u.avatar_color as color
    from pool_members m join users u on u.id = m.user_id
    where m.pool_id = ${pool.id} order by m.joined_at, u.id`;
  const [w] = await sql<{ n: number }[]>`select count(*)::int as n from pool_waitlist where pool_id = ${pool.id}`;
  return { ver: pool.ver, status: pool.status, members: [...members], waitlist: w?.n ?? 0 };
}

async function toDTO(pool: PoolRow, userId: string, state?: PoolState): Promise<PoolDTO> {
  const sql = db();
  const s = state ?? (await loadState(sql, pool));
  const seat = s.members.some((m) => m.id === userId);
  const [w] = await sql`select 1 from pool_waitlist where pool_id = ${pool.id} and user_id = ${userId}`;
  return {
    poolId: pool.id,
    messageId: pool.message_id,
    content: pool.content,
    meta: signedMetadata(pool.id, s),
    me: { seat, waitlisted: Boolean(w), organiser: pool.organiser_id === userId },
    groupChannelId: seat ? pool.group_channel_id : null,
  };
}

async function publish(pool: PoolRow, room: RoomRow, state: PoolState): Promise<void> {
  if (!pool.message_id) return;
  await setCommunityMessageMetadata({
    channelId: room.channel_id,
    messageId: pool.message_id,
    operatorUserId: pool.organiser_id,
    metadata: signedMetadata(pool.id, state),
  });
}

async function poolNotice(pool: PoolRow, fromUserId: string, kind: NoticeContent["kind"], text: string): Promise<void> {
  const content: NoticeContent = { v: 1, kind, text, refId: pool.id, createdAt: Date.now() };
  await sendGroupMessage({ channelId: pool.group_channel_id, fromUserId, messageType: MSG.notice, content }).catch((err) =>
    console.warn("[pools] notice failed", (err as Error).message),
  );
}

export async function createPool(room: RoomRow, user: User, input: NewPool): Promise<PoolDTO> {
  if (looksLikeContactDetails(`${input.place} ${input.note ?? ""}`)) {
    throw new HttpError(400, "contact_details", "Share numbers in the group chat once people join, not here.");
  }
  await rateLimit(`pool:${user.id}`, 4, 600);
  const sql = db();
  const open = await sql`
    select 1 from pools where room_id = ${room.id} and organiser_id = ${user.id} and status in ('open', 'full')`;
  if (open.length >= 3) throw new HttpError(429, "too_many_pools", "You already have 3 open. Close one first.");

  const poolId = randomUUID();
  const groupChannelId = `pl${poolId.replace(/-/g, "")}`;
  const content: PoolContent = {
    v: 1,
    poolId,
    kind: input.kind,
    place: input.place,
    capacity: input.capacity,
    ...(input.totalCost !== undefined ? { totalCost: input.totalCost } : {}),
    currency: input.currency,
    ...(input.departsAt !== undefined ? { departsAt: input.departsAt } : {}),
    ...(input.note ? { note: input.note } : {}),
    createdAt: Date.now(),
    organiser: authorOf(user),
  };

  // Private chat for whoever ends up in the pool. Nobody can join it except through a claim.
  await createGroupChannel(groupChannelId, `${KIND_LABEL[input.kind]} → ${input.place}`, user.id, []);

  const [pool] = await sql<PoolRow[]>`
    insert into pools (id, room_id, organiser_id, kind, capacity, content, group_channel_id)
    values (${poolId}, ${room.id}, ${user.id}, ${input.kind}, ${input.capacity}, ${sql.json(content as never)}, ${groupChannelId})
    returning *`;
  if (!pool) throw new Error("pool insert failed");
  await sql`insert into pool_members (pool_id, user_id) values (${poolId}, ${user.id})`;
  const state = await loadState(sql, pool);

  try {
    const { messageId } = await sendCommunityMessage({
      channelId: room.channel_id,
      fromUserId: user.id,
      messageType: MSG.pool,
      content,
      metadata: signedMetadata(poolId, state),
      pushContent: `${KIND_LABEL[input.kind]} pool → ${input.place}`,
    });
    pool.message_id = messageId;
    await sql`update pools set message_id = ${messageId} where id = ${poolId}`;
  } catch (err) {
    await sql`delete from pools where id = ${poolId}`;
    throw err;
  }
  void track("pool_created", user.id, room.id, { kind: input.kind, demo: room.is_demo });
  return toDTO(pool, user.id, state);
}

async function lockPool(tx: Tx, poolId: string, roomId: string): Promise<PoolRow> {
  const [pool] = await tx<PoolRow[]>`select * from pools where id = ${poolId} and room_id = ${roomId} for update`;
  if (!pool) throw new HttpError(404, "no_pool", "This no longer exists.");
  return pool;
}

async function bump(tx: Tx, pool: PoolRow, status: PoolStatus): Promise<PoolRow> {
  const [next] = await tx<PoolRow[]>`update pools set ver = ver + 1, status = ${status} where id = ${pool.id} returning *`;
  if (!next) throw new Error("pool update failed");
  return next;
}

export type ClaimOutcome = "seat" | "waitlisted" | "already";

/**
 * Claim a seat. The row lock on the pool serialises concurrent claims, so when
 * two people tap the last seat at the same moment exactly one gets it and the
 * other is put on the waitlist, and everyone sees the same order.
 */
export async function claimSeat(room: RoomRow, user: User, poolId: string): Promise<{ outcome: ClaimOutcome; pool: PoolDTO }> {
  await rateLimit(`claim:${user.id}`, 20, 60);
  const sql = db();
  const { outcome, pool, state } = await sql.begin(async (tx) => {
    const locked = await lockPool(tx, poolId, room.id);
    if (locked.status === "done" || locked.status === "cancelled") throw new HttpError(409, "pool_closed", "This one is closed.");
    const [mine] = await tx`select 1 from pool_members where pool_id = ${poolId} and user_id = ${user.id}`;
    if (mine) return { outcome: "already" as const, pool: locked, state: await loadState(tx, locked) };

    const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from pool_members where pool_id = ${poolId}`;
    let result: ClaimOutcome;
    let next: PoolRow;
    if (n < locked.capacity) {
      await tx`insert into pool_members (pool_id, user_id) values (${poolId}, ${user.id})`;
      await tx`delete from pool_waitlist where pool_id = ${poolId} and user_id = ${user.id}`;
      next = await bump(tx, locked, n + 1 >= locked.capacity ? "full" : "open");
      result = "seat";
    } else {
      await tx`insert into pool_waitlist (pool_id, user_id) values (${poolId}, ${user.id}) on conflict do nothing`;
      next = await bump(tx, locked, "full");
      result = "waitlisted";
    }
    return { outcome: result, pool: next, state: await loadState(tx, next) };
  });

  if (outcome === "seat") {
    await joinGroupChannel(pool.group_channel_id, [user.id]);
    await poolNotice(pool, user.id, "pool_claimed", `${user.display_name} joined`);
  }
  if (outcome !== "already") await publish(pool, room, state);
  void track(outcome === "waitlisted" ? "pool_waitlisted" : "pool_claimed", user.id, room.id, { demo: room.is_demo, outcome });
  return { outcome, pool: await toDTO(pool, user.id, state) };
}

/** Give up a seat (or leave the waitlist). The first person waiting is promoted automatically. */
export async function releaseSeat(room: RoomRow, user: User, poolId: string): Promise<PoolDTO> {
  const sql = db();
  const { pool, state, promoted, hadSeat } = await sql.begin(async (tx) => {
    const locked = await lockPool(tx, poolId, room.id);
    if (locked.organiser_id === user.id) {
      throw new HttpError(400, "organiser", "You started this one. Cancel it instead.");
    }
    const seat = await tx`delete from pool_members where pool_id = ${poolId} and user_id = ${user.id} returning 1`;
    const waiting = await tx`delete from pool_waitlist where pool_id = ${poolId} and user_id = ${user.id} returning 1`;
    if (seat.length === 0 && waiting.length === 0) return { pool: locked, state: await loadState(tx, locked), promoted: null, hadSeat: false };

    let promotedId: string | null = null;
    if (seat.length > 0 && locked.status !== "done" && locked.status !== "cancelled") {
      const [first] = await tx<{ user_id: string }[]>`
        delete from pool_waitlist where (pool_id, user_id) = (
          select pool_id, user_id from pool_waitlist where pool_id = ${poolId} order by created_at, user_id limit 1)
        returning user_id`;
      if (first) {
        await tx`insert into pool_members (pool_id, user_id) values (${poolId}, ${first.user_id})`;
        promotedId = first.user_id;
      }
    }
    const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from pool_members where pool_id = ${poolId}`;
    const status: PoolStatus = locked.status === "done" || locked.status === "cancelled" ? locked.status : n >= locked.capacity ? "full" : "open";
    const next = await bump(tx, locked, status);
    return { pool: next, state: await loadState(tx, next), promoted: promotedId, hadSeat: seat.length > 0 };
  });

  if (hadSeat) {
    await leaveGroupChannel(pool.group_channel_id, [user.id]).catch(() => {});
    await poolNotice(pool, pool.organiser_id, "pool_released", `${user.display_name} left`);
  }
  if (promoted) {
    await joinGroupChannel(pool.group_channel_id, [promoted]);
    const name = state.members.find((m) => m.id === promoted)?.name ?? "Someone";
    await poolNotice(pool, promoted, "pool_promoted", `${name} joined from the waitlist`);
  }
  await publish(pool, room, state);
  void track("pool_released", user.id, room.id, { demo: room.is_demo, promoted: Boolean(promoted) });
  return toDTO(pool, user.id, state);
}

export async function closePool(room: RoomRow, user: User, poolId: string, status: "done" | "cancelled"): Promise<PoolDTO> {
  const sql = db();
  const { pool, state } = await sql.begin(async (tx) => {
    const locked = await lockPool(tx, poolId, room.id);
    if (locked.organiser_id !== user.id) throw new HttpError(403, "not_organiser", "Only the person who started this can close it.");
    if (locked.status === "done" || locked.status === "cancelled") return { pool: locked, state: await loadState(tx, locked) };
    await tx`delete from pool_waitlist where pool_id = ${poolId}`;
    const next = await bump(tx, locked, status);
    return { pool: next, state: await loadState(tx, next) };
  });
  await publish(pool, room, state);
  await poolNotice(pool, user.id, "pool_closed", status === "done" ? "Marked as done" : "Cancelled by the organiser");
  void track("pool_closed", user.id, room.id, { status, demo: room.is_demo });
  return toDTO(pool, user.id, state);
}

export async function listPools(roomId: string, userId: string): Promise<PoolDTO[]> {
  const rows = await db()<PoolRow[]>`
    select * from pools where room_id = ${roomId} and message_id is not null
      and (status in ('open', 'full') or created_at > now() - interval '12 hours')
    order by created_at desc limit 40`;
  return Promise.all(rows.map((r) => toDTO(r, userId)));
}
