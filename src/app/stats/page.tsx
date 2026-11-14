import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAdminKey } from "@/lib/server/admin";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Traction", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ key?: string }> };

interface Totals {
  users: number;
  users_in_rooms: number;
  rooms: number;
  rooms_2plus: number;
  cards: number;
  votes: number;
  pools: number;
  claims: number;
  returning: number;
  demo_runs: number;
}

/**
 * Private traction dashboard. Real usage only: demo rooms and simulated
 * travellers are excluded from every number here.
 */
export default async function StatsPage({ searchParams }: Props) {
  const { key } = await searchParams;
  if (!isAdminKey(key)) notFound();
  const sql = db();

  const [totals] = await sql<Totals[]>`
    with real_rooms as (select id from rooms where not is_demo),
         real_members as (
           select m.room_id, m.user_id from room_members m
           join real_rooms r on r.id = m.room_id
           join users u on u.id = m.user_id and not u.is_sim)
    select
      (select count(*)::int from users where not is_sim) as users,
      (select count(distinct user_id)::int from real_members) as users_in_rooms,
      (select count(distinct room_id)::int from real_members) as rooms,
      (select count(*)::int from (select room_id from real_members group by room_id having count(*) >= 2) x) as rooms_2plus,
      (select count(*)::int from cards c join real_rooms r on r.id = c.room_id) as cards,
      (select count(*)::int from votes v join cards c on c.id = v.card_id join real_rooms r on r.id = c.room_id) as votes,
      (select count(*)::int from pools p join real_rooms r on r.id = p.room_id) as pools,
      (select count(*)::int from pool_members pm join pools p on p.id = pm.pool_id join real_rooms r on r.id = p.room_id
         where pm.user_id <> p.organiser_id) as claims,
      (select count(*)::int from users where not is_sim and last_seen_at > created_at + interval '1 day') as returning,
      (select count(*)::int from demo_runs) as demo_runs`;

  const daily = await sql<{ day: string; active: number; new_users: number }[]>`
    select to_char(d, 'DD Mon') as day,
      (select count(distinct e.user_id)::int from events e
         left join rooms r on r.id = e.room_id
         join users u on u.id = e.user_id and not u.is_sim
       where e.created_at >= d and e.created_at < d + interval '1 day' and coalesce(r.is_demo, false) = false) as active,
      (select count(*)::int from users u where not u.is_sim and u.created_at >= d and u.created_at < d + interval '1 day') as new_users
    from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d
    order by d`;

  const topRooms = await sql<{ room_key: string; members: number; cards: number; pools: number }[]>`
    select r.room_key,
      (select count(*)::int from room_members m join users u on u.id = m.user_id and not u.is_sim where m.room_id = r.id) as members,
      (select count(*)::int from cards c where c.room_id = r.id) as cards,
      (select count(*)::int from pools p where p.room_id = r.id) as pools
    from rooms r where not r.is_demo
    order by members desc, r.created_at desc limit 15`;

  const reports = await sql<{ id: number; room_key: string | null; target_type: string; target_id: string; reason: string; created_at: Date }[]>`
    select rp.id, r.room_key, rp.target_type, rp.target_id, rp.reason, rp.created_at
    from reports rp left join rooms r on r.id = rp.room_id
    where rp.status = 'open' order by rp.created_at desc limit 30`;

  const t = totals!;
  const tiles: [string, number, string][] = [
    ["Real users", t.users, "guests who opened Limbo"],
    ["In a trip room", t.users_in_rooms, "joined at least one real room"],
    ["Rooms used", t.rooms, "trip rooms with a real person"],
    ["Rooms with 2+ people", t.rooms_2plus, "proof the room-exists-first idea works"],
    ["Facts posted", t.cards, "intel cards in real rooms"],
    ["Confirm / dispute votes", t.votes, ""],
    ["Pools", t.pools, `${t.claims} seats claimed by others`],
    ["Came back", t.returning, "returned a day or more later"],
  ];
  const maxActive = Math.max(1, ...daily.map((d) => d.active));

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">Limbo traction</h1>
      <p className="mt-1 text-ink-2">
        Real usage only. Demo rooms ({t.demo_runs} runs) and simulated travellers are excluded. Nexconn console MAU is the
        authoritative active-user count.
      </p>

      <section aria-label="Totals" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className="rounded-[var(--radius)] bg-surface p-4">
            <p className="text-sm text-ink-3">{label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
            {hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
          </div>
        ))}
      </section>

      <section aria-labelledby="daily" className="mt-8 rounded-[var(--radius)] bg-surface p-4">
        <h2 id="daily" className="font-semibold">
          Active people per day (last 14 days)
        </h2>
        <ol className="mt-4 flex h-40 items-end gap-1.5">
          {daily.map((d) => (
            <li key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${d.active} active, ${d.new_users} new`}>
              <span className="text-xs tabular-nums text-ink-2">{d.active || ""}</span>
              <span className="w-full rounded-t bg-accent" style={{ height: `${(d.active / maxActive) * 100}%`, minHeight: d.active ? 3 : 0 }} />
              <span className="text-[0.65rem] text-ink-3">{d.day.split(" ")[0]}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="rooms" className="mt-8">
        <h2 id="rooms" className="font-semibold">
          Busiest real rooms
        </h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-ink-3">
            <tr>
              <th className="py-1 font-medium">Room</th>
              <th className="py-1 text-right font-medium">People</th>
              <th className="py-1 text-right font-medium">Facts</th>
              <th className="py-1 text-right font-medium">Pools</th>
            </tr>
          </thead>
          <tbody>
            {topRooms.map((r) => (
              <tr key={r.room_key} className="border-t border-line">
                <td className="py-1.5 font-mono">{r.room_key}</td>
                <td className="py-1.5 text-right tabular-nums">{r.members}</td>
                <td className="py-1.5 text-right tabular-nums">{r.cards}</td>
                <td className="py-1.5 text-right tabular-nums">{r.pools}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="reports" className="mt-8">
        <h2 id="reports" className="font-semibold">
          Open reports ({reports.length})
        </h2>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">None.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {reports.map((r) => (
              <li key={r.id} className="rounded bg-surface px-3 py-2">
                <span className="font-semibold">{r.reason}</span> · {r.target_type} {r.target_id.slice(0, 12)} · {r.room_key ?? "?"} ·{" "}
                {r.created_at.toISOString().slice(0, 16).replace("T", " ")}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
