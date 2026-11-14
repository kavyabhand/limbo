// Benchmark: fairness of the last-seat race and server latency, against a live server and a real Nexconn app.
// Writes the raw numbers to report/data/bench.json (used by the write-up).   npm run bench
//
//   BASE_URL  server to test (default http://localhost:3000)
//   TRIALS    race trials (default 30)
//   RACERS    simultaneous claimants per trial (default 8)
import { mkdirSync, writeFileSync } from "node:fs";
import { BASE_URL, rand, today } from "../e2e/_helpers.mjs";

const TRIALS = Number(process.env.TRIALS ?? 30);
const RACERS = Number(process.env.RACERS ?? 8);
const lat = {};

function guest() {
  let cookie = "";
  return async (name, path, body) => {
    const t0 = performance.now();
    const res = await fetch(BASE_URL + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    (lat[name] ??= []).push(performance.now() - t0);
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    if (res.status >= 400) throw new Error(`${name} ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
    return json;
  };
}

const date = today();
const code = `BZ${1000 + rand(8999)}`;
const organisers = Array.from({ length: Math.ceil(TRIALS / 4) }, guest);
const racers = Array.from({ length: RACERS * 2 }, guest);
const voters = Array.from({ length: 10 }, guest);

let roomId;
for (const [i, g] of [...organisers, ...racers, ...voters].entries()) {
  await g("session", "/api/session", {});
  const j = await g(i === 0 ? "join (creates room)" : "join", "/api/rooms/join", { mode: "flight", code, date });
  roomId = j.room.id;
}
console.log(`room ${code} ${date}: ${organisers.length + racers.length + voters.length} guests joined`);

// Facts and votes
for (let k = 0; k < 6; k++) {
  const author = voters[k];
  const { card } = await author("post update", `/api/rooms/${roomId}/cards`, { kind: "desk", text: `Desk ${k + 1} open at gate ${10 + k}`, source: "saw_myself" });
  for (const v of voters) if (v !== author) await v("vote", `/api/rooms/${roomId}/cards/${card.cardId}/vote`, { vote: "confirm" });
}
await voters[0]("room state", `/api/rooms/${roomId}/state`);
for (let k = 0; k < 9; k++) await voters[k % voters.length]("room state", `/api/rooms/${roomId}/state`);

// The race: a cab with one free seat, RACERS people claim it at the same instant.
const trials = [];
for (let k = 0; k < TRIALS; k++) {
  const org = organisers[Math.floor(k / 4)];
  const { pool } = await org("create pool", `/api/rooms/${roomId}/pools`, { kind: "cab", place: `Terminal ${k}`, capacity: 2, totalCost: 800, currency: "INR" });
  const group = racers.slice((k % 2) * RACERS, (k % 2) * RACERS + RACERS);
  const t0 = performance.now();
  const results = await Promise.all(group.map((g) => g("claim (raced)", `/api/rooms/${roomId}/pools/${pool.poolId}/claim`, {})));
  const spread = performance.now() - t0;
  const seats = results.filter((r) => r.outcome === "seat").length;
  const waitlisted = results.filter((r) => r.outcome === "waitlisted").length;
  const final = results.map((r) => r.pool?.state?.seats?.length ?? r.pool?.taken).filter((x) => x !== undefined);
  trials.push({ seats, waitlisted, ms: Math.round(spread), final: final.length ? Math.max(...final) : null });
  process.stdout.write(`trial ${k + 1}/${TRIALS}: ${seats} seat, ${waitlisted} waitlisted\n`);
  await org("close pool", `/api/rooms/${roomId}/pools/${pool.poolId}/close`, { status: "done" });   // an organiser may hold 3 open pools
  await new Promise((r) => setTimeout(r, 2600)); // stay inside the 20 claims/minute limit per guest
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, p50: +q(0.5).toFixed(1), p90: +q(0.9).toFixed(1), p99: +q(0.99).toFixed(1), mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) };
};
const out = {
  when: new Date().toISOString(),
  base: BASE_URL.includes("localhost") ? "local production build (next start) + live Nexconn (Singapore)" : BASE_URL,
  race: { trials: TRIALS, racers: RACERS, exactlyOneWinner: trials.filter((t) => t.seats === 1 && t.waitlisted === RACERS - 1).length, detail: trials },
  latencyMs: Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, stats(v)])),
};
mkdirSync(new URL("../../report/data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../report/data/bench.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(`\nexactly one winner in ${out.race.exactlyOneWinner}/${TRIALS} trials`);
console.table(out.latencyMs);
