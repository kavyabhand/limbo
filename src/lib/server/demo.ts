import "server-only";
import { randomInt } from "node:crypto";
import { roomKey, utcDateString } from "@/lib/shared/trip";
import { postIntel, vote } from "./cards";
import { db } from "./db";
import { HttpError, track } from "./http";
import { issueAccessToken, joinCommunityChannel, sendCommunityMessage } from "./nexconn";
import { claimSeat, createPool } from "./pools";
import { ensureMembership, findRoomById, findRoomByKey, getOrCreateRoom, type RoomRow } from "./rooms";
import type { User } from "./session";

/**
 * Demo mode: a scripted, clearly labelled crowd of simulated travellers so a
 * judge testing alone sees the product alive. Everything runs through the real
 * stack (Nexconn messages, metadata, group channels, database). Simulated users
 * never connect a client, so they do not count as Nexconn active users, and
 * demo rooms are excluded from traction numbers.
 */

interface Sim {
  id: string;
  name: string;
  color: string;
  language: string;
  agentOrg?: string;
}

const SIMS: Sim[] = [
  { id: "simotter", name: "Calm Otter", color: "#00695c", language: "en" },
  { id: "simfalcon", name: "Bright Falcon", color: "#b03a2e", language: "hi" },
  { id: "simlynx", name: "Steady Lynx", color: "#1565c0", language: "en" },
  { id: "simheron", name: "Quiet Heron", color: "#5d4fb3", language: "en" },
  { id: "simpuffin", name: "Kind Puffin", color: "#2e7d32", language: "de" },
  { id: "simkoala", name: "Brave Koala", color: "#9c4221", language: "en" },
  { id: "simwren", name: "Patient Wren", color: "#ad1457", language: "ta" },
  { id: "simibex", name: "Gentle Ibex", color: "#6d4c41", language: "hi" },
  { id: "simrobin", name: "Merry Robin", color: "#1d6fa5", language: "en" },
  { id: "simcrane", name: "Wise Crane", color: "#8e44ad", language: "en" },
  { id: "simgecko", name: "Swift Gecko", color: "#00695c", language: "es" },
  { id: "simagent", name: "Demo Airlines desk", color: "#1a4f9c", language: "en", agentOrg: "Demo Airlines" },
];

const byId = new Map(SIMS.map((s) => [s.id, s]));

function asUser(sim: Sim): User {
  return {
    id: sim.id,
    display_name: sim.name,
    avatar_color: sim.color,
    language: sim.language,
    is_agent: Boolean(sim.agentOrg),
    agent_org: sim.agentOrg ?? null,
  };
}

const sim = (id: string) => asUser(byId.get(id)!);

/** Create the simulated users once (and register them with Nexconn so they can be senders). */
async function ensureSims(): Promise<void> {
  const sql = db();
  for (const s of SIMS) {
    const inserted = await sql`
      insert into users (id, display_name, avatar_color, language, is_sim, is_agent, agent_org)
      values (${s.id}, ${s.name}, ${s.color}, ${s.language}, true, ${Boolean(s.agentOrg)}, ${s.agentOrg ?? null})
      on conflict (id) do nothing returning id`;
    if (inserted.length > 0) await issueAccessToken(s.id, s.name);
  }
}

async function say(room: RoomRow, simId: string, text: string): Promise<void> {
  const s = byId.get(simId)!;
  await sendCommunityMessage({
    channelId: room.channel_id,
    fromUserId: s.id,
    messageType: "RC:TxtMsg",
    // Server-side wire format for text: { content, user }. The Web SDK exposes it as { text, senderUserInfo }.
    content: { content: text, user: { id: s.id, name: s.name, extra: JSON.stringify({ c: s.color, l: s.language }) } },
  });
}

async function cardIdByText(roomId: string, text: string): Promise<string | null> {
  const [row] = await db()<{ id: string }[]>`
    select id from cards where room_id = ${roomId} and content->>'text' = ${text} order by created_at desc limit 1`;
  return row?.id ?? null;
}

async function poolOf(roomId: string): Promise<{ id: string; seats: number; members: string[] } | null> {
  const [row] = await db()<{ id: string; seats: number; members: string[] }[]>`
    select p.id, p.capacity as seats, array_agg(m.user_id order by m.joined_at) as members
    from pools p join pool_members m on m.pool_id = p.id
    where p.room_id = ${roomId} group by p.id order by p.created_at limit 1`;
  return row ?? null;
}

const DESK = "Rebooking desk open at gate 12, short queue";
const DELAY = "Board now says 2 hours late";
const REBOOK = "Everyone moved to AI 103, 07:40 tomorrow";

/** Seconds after start at which the client should trigger each step. Step 0 runs at creation. */
export const DEMO_SCHEDULE = [0, 6, 12, 18, 24, 34, 46, 56, 66, 78] as const;

type Step = (room: RoomRow, ownerId: string) => Promise<void>;

const STEPS: Step[] = [
  // 0: the room already has people and a reported delay
  async (room) => {
    await say(room, "simotter", "anyone know what's going on? board just says delayed");
    await say(room, "simfalcon", "गेट पर कोई अपडेट नहीं है, सब इंतज़ार कर रहे हैं");
    const card = await postIntel(room, sim("simlynx"), { kind: "delay", text: DELAY, delayMinutes: 120, source: "board" });
    for (const v of ["simotter", "simheron", "simrobin"]) await vote(room, sim(v), card.cardId, "confirm");
  },
  // 1: someone finds the rebooking desk
  async (room) => {
    await postIntel(room, sim("simheron"), { kind: "desk", text: DESK, source: "saw_myself" });
  },
  // 2: others confirm it, live
  async (room) => {
    const id = await cardIdByText(room.id, DESK);
    if (id) for (const v of ["simotter", "simcrane"]) await vote(room, sim(v), id, "confirm");
  },
  // 3: a traveller who doesn't speak the local language
  async (room) => {
    await say(room, "simpuffin", "Gibt es Hotelgutscheine? Ich habe meinen Anschluss verpasst.");
  },
  // 4: a hotel room pool with seats for others
  async (room) => {
    await createPool(room, sim("simkoala"), {
      kind: "hotel",
      place: "Airport Plaza",
      capacity: 3,
      totalCost: 4200,
      currency: "INR",
      note: "2 beds, 10 min by cab",
    });
    const id = await cardIdByText(room.id, DESK);
    if (id) await vote(room, sim("simibex"), id, "confirm");
  },
  // 5: one seat goes; one is left for the judge
  async (room) => {
    const pool = await poolOf(room.id);
    if (pool && pool.members.length < pool.seats - 1) await claimSeat(room, sim("simwren"), pool.id);
  },
  // 6: Hindi message about the desk (translates for the reader)
  async (room) => {
    await say(room, "simibex", "गेट 12 पर रीबुकिंग डेस्क खुल गया है, लाइन छोटी है");
  },
  // 7: if the judge claimed the last seat, the next person is fairly waitlisted
  async (room, ownerId) => {
    const pool = await poolOf(room.id);
    if (pool?.members.includes(ownerId)) await claimSeat(room, sim("simgecko"), pool.id);
  },
  // 8: the official update lands and is pinned
  async (room) => {
    await postIntel(room, sim("simagent"), {
      kind: "cancel",
      text: `${room.code} is cancelled. You will be rebooked on AI 103 at 07:40 tomorrow.`,
      detail: "Rebooking counters at gate 12 are open now. Hotel vouchers are available at the same desk.",
    });
  },
  // 9: the crowd confirms the new plan; the status line settles
  async (room) => {
    const card = await postIntel(room, sim("simrobin"), { kind: "rebooking", text: REBOOK, source: "staff" });
    for (const v of ["simotter", "simheron", "simcrane", "simfalcon"]) await vote(room, sim(v), card.cardId, "confirm");
    await say(room, "simotter", "thanks, heading to gate 12");
  },
];

/** A fresh demo room for this visitor (each judge gets their own). */
export async function createDemo(user: User): Promise<RoomRow> {
  await ensureSims();
  // A fresh, clearly-labelled room per run ("DEMO4821"); retry on the rare collision.
  const date = utcDateString(Date.now());
  let trip = { mode: "flight" as const, code: `DEMO${randomInt(1000, 10000)}`, date };
  for (let i = 0; i < 5 && (await findRoomByKey(roomKey(trip))); i++) trip = { ...trip, code: `DEMO${randomInt(1000, 10000)}` };
  const room = await getOrCreateRoom(trip, user.id, { demo: true });
  await ensureMembership(room, user.id);

  const sql = db();
  // Simulated travellers join the community channel (they show up in the member count).
  await Promise.all(SIMS.map((s) => joinCommunityChannel(room.channel_id, s.id)));
  await sql`
    insert into room_members (room_id, user_id)
    select ${room.id}, id from users where id = any(${SIMS.map((s) => s.id)}::text[])
    on conflict do nothing`;
  await sql`insert into demo_runs (room_id, owner_id, step) values (${room.id}, ${user.id}, 0) on conflict do nothing`;
  await STEPS[0]!(room, user.id);
  void track("demo_started", user.id, room.id, { demo: true });
  return (await findRoomById(room.id)) ?? room;
}

/** Run step n exactly once (steps run in order; repeated or out-of-order calls are no-ops). */
export async function runDemoStep(roomId: string, user: User, n: number): Promise<{ ran: boolean; step: number }> {
  const room = await findRoomById(roomId);
  if (!room || !room.is_demo) throw new HttpError(404, "no_demo", "That demo room doesn't exist.");
  const [run] = await db()<{ owner_id: string; step: number }[]>`select owner_id, step from demo_runs where room_id = ${roomId}`;
  if (!run) throw new HttpError(404, "no_demo", "That demo room doesn't exist.");
  if (run.owner_id !== user.id) return { ran: false, step: run.step };
  if (n < 1 || n >= STEPS.length) return { ran: false, step: run.step };
  const claimed = await db()`update demo_runs set step = ${n} where room_id = ${roomId} and step = ${n - 1} returning 1`;
  if (claimed.length === 0) return { ran: false, step: run.step };
  await STEPS[n]!(room, user.id);
  return { ran: true, step: n };
}

export const DEMO_STEPS = STEPS.length;
