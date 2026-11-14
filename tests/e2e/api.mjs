// API suite: the whole server through HTTP, with several independent guests
// (separate cookie jars), against a real Nexconn app.  npm run e2e:api
import { BASE_URL, rand, suite, today } from "./_helpers.mjs";

function guest() {
  let cookie = "";
  return async (path, body, method) => {
    const res = await fetch(BASE_URL + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };
}

const t = suite(`API suite against ${BASE_URL}`);
const [A, B, C, D] = [guest(), guest(), guest(), guest()];
const date = today();
const code = `ZZ${1000 + rand(8999)}`;

const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.json());
t.check(health.status === "ok", "health: database and Nexconn reachable", health);

const s1 = await A("/api/session", {});
t.check(s1.status === 200 && s1.nexconn?.token && s1.user?.name, "session issues a guest and a Nexconn token", { status: s1.status });
const s2 = await A("/api/session", {});
t.check(s2.user?.id === s1.user?.id, "the guest is stable across calls (signed cookie)");
for (const g of [B, C, D]) await g("/api/session", {});

t.check((await A("/api/rooms/join", { mode: "flight", code: "", date })).status === 400, "empty trip code is rejected");
t.check((await A("/api/rooms/join", { mode: "flight", code: "12345", date })).needsConfirm === true, "unrecognised code asks for confirmation");
t.check((await A("/api/rooms/join", { mode: "flight", code, date: "2030-01-01" })).status === 400, "date outside the window is rejected");
const csrf = await fetch(`${BASE_URL}/api/rooms/join`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
t.check(csrf.status === 415, "non-JSON (cross-site form) posts are refused");

const jA = await A("/api/rooms/join", { mode: "flight", code, date });
t.check(jA.status === 200 && jA.room?.channelId, `first person creates the room (${jA.room?.slug})`, jA);
const [jB, jC] = await Promise.all([B, C].map((g) => g("/api/rooms/join", { mode: "flight", code: code.toLowerCase(), date })));
await D("/api/rooms/join", { mode: "flight", code, date });
t.check(jB.room?.id === jA.room?.id && jC.room?.id === jA.room?.id, "everyone else lands in the same room");
const roomId = jA.room.id;
t.check((await guest()(`/api/rooms/${roomId}/state`)).status === 401, "room state needs a session");

const card = await A(`/api/rooms/${roomId}/cards`, { kind: "desk", text: "Rebooking desk open at gate 12", source: "saw_myself" });
t.check(card.status === 201 && card.card?.messageId && card.card?.meta?.sig, "a fact is sent through Nexconn with signed metadata", card);
const cardId = card.card.cardId;
t.check((await A(`/api/rooms/${roomId}/cards/${cardId}/vote`, { vote: "confirm" })).status === 400, "you can't confirm your own fact");
await B(`/api/rooms/${roomId}/cards/${cardId}/vote`, { vote: "confirm" });
await C(`/api/rooms/${roomId}/cards/${cardId}/vote`, { vote: "confirm" });
const v3 = await D(`/api/rooms/${roomId}/cards/${cardId}/vote`, { vote: "dispute" });
const st3 = JSON.parse(v3.card?.meta?.s ?? "{}");
t.check(st3.confirms === 2 && st3.disputes === 1, "votes tally: 2 confirm, 1 dispute", st3);
const v4 = await D(`/api/rooms/${roomId}/cards/${cardId}/vote`, { vote: "confirm" });
const st4 = JSON.parse(v4.card?.meta?.s ?? "{}");
t.check(st4.confirms === 3 && st4.disputes === 0 && v4.card.myVote === "confirm", "changing a vote replaces it", st4);
const v5 = await D(`/api/rooms/${roomId}/cards/${cardId}/vote`, { vote: "none" });
t.check(JSON.parse(v5.card.meta.s).confirms === 2, "clearing a vote removes it");

const d1 = await A(`/api/rooms/${roomId}/cards`, { kind: "delay", text: "About 2 hours late", delayMinutes: 120 });
const d2 = await B(`/api/rooms/${roomId}/cards`, { kind: "delay", text: "Board says 3 hours now", delayMinutes: 180 });
const state = await A(`/api/rooms/${roomId}/state`);
const older = state.cards?.find((c) => c.cardId === d1.card?.cardId);
t.check(older && JSON.parse(older.meta.s).superseded === true && d2.card.content.supersedes === d1.card.cardId, "a newer delay estimate replaces the older one");
t.check((await A(`/api/rooms/${roomId}/cards`, { kind: "delay", text: "late" })).status === 400, "a delay without an estimate is rejected");
t.check((await A(`/api/rooms/${roomId}/cards`, { kind: "other", text: "call me on +91 98765 43210" })).status === 400, "phone numbers are refused on the board");

const pool = await A(`/api/rooms/${roomId}/pools`, { kind: "cab", place: "City centre", capacity: 3, totalCost: 1200, currency: "INR" });
t.check(pool.status === 201 && pool.pool?.groupChannelId && pool.pool.me.organiser, "a 3-person cab pool creates a private group channel", pool);
const poolId = pool.pool.poolId;
const c1 = await B(`/api/rooms/${roomId}/pools/${poolId}/claim`, {});
t.check(c1.outcome === "seat" && c1.pool.groupChannelId, "B takes a seat and gets the pool chat");
const [rc, rd] = await Promise.all([C(`/api/rooms/${roomId}/pools/${poolId}/claim`, {}), D(`/api/rooms/${roomId}/pools/${poolId}/claim`, {})]);
const outcomes = [rc.outcome, rd.outcome].sort().join(",");
t.check(outcomes === "seat,waitlisted", `two simultaneous claims for the last seat: exactly one wins (${outcomes})`, [rc, rd]);
const [winner, loser, winRes] = rc.outcome === "seat" ? [C, D, rc] : [D, C, rd];
const full = JSON.parse(winRes.pool.meta.s);
t.check(full.members.length === 3 && full.status === "full", "the pool is full with 3 people, in claim order");
t.check((await winner(`/api/rooms/${roomId}/pools/${poolId}/claim`, {})).outcome === "already", "claiming twice is harmless");
t.check((await A(`/api/rooms/${roomId}/pools/${poolId}/release`, {})).status === 400, "the organiser can't just leave (they cancel instead)");
await winner(`/api/rooms/${roomId}/pools/${poolId}/release`, {});
const promoted = (await loser(`/api/rooms/${roomId}/state`)).pools?.find((p) => p.poolId === poolId);
t.check(promoted?.me.seat === true && promoted.groupChannelId, "when someone leaves, the first person waiting moves in");
t.check((await B(`/api/rooms/${roomId}/pools/${poolId}/close`, { status: "done" })).status === 403, "only the organiser can close it");
const closed = await A(`/api/rooms/${roomId}/pools/${poolId}/close`, { status: "done" });
t.check(JSON.parse(closed.pool.meta.s).status === "done", "the organiser marks it done");
const late = await B(`/api/rooms/${roomId}/pools/${poolId}/claim`, {});
t.check(late.status === 409 || late.outcome === "already", "a closed pool takes no new claims");

const me = await A("/api/me", { name: "  Priya   S  ", language: "hi" }, "PATCH");
t.check(me.user?.name === "Priya S" && me.user.language === "hi", "rename and language change (whitespace cleaned)", me);
t.check((await A("/api/me", { name: "x".repeat(40) }, "PATCH")).status === 400, "an over-long name is rejected");
t.check((await B(`/api/rooms/${roomId}/reports`, { targetType: "card", targetId: cardId, reason: "false_info" })).ok === true, "a report is accepted");

const final = await B(`/api/rooms/${roomId}/state`);
t.check(final.members?.total === 4 && final.cards.length === 3 && final.pools.length === 1, `final state: ${final.members?.total} people, ${final.cards?.length} facts, ${final.pools?.length} pool`);
t.done();
