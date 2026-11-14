import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAdminKey } from "@/lib/server/admin";
import { db } from "@/lib/server/db";
import { getDaily, getTotals } from "@/lib/server/traction";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Traction", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ key?: string }> };


/**
 * Private traction dashboard. Real usage only: demo rooms and simulated
 * travellers are excluded from every number here.
 */
export default async function StatsPage({ searchParams }: Props) {
  const { key } = await searchParams;
  if (!isAdminKey(key)) notFound();
  const sql = db();

  const [t, daily] = await Promise.all([getTotals(), getDaily(14)]);

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
          <div key={label} className="rounded-2xl bg-subtle p-4">
            <p className="text-sm text-ink-3">{label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
            {hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
          </div>
        ))}
      </section>

      <section aria-labelledby="daily" className="mt-8 rounded-2xl bg-subtle p-4">
        <h2 id="daily" className="font-semibold">
          Active people per day (last 14 days)
        </h2>
        <ol className="mt-4 flex h-40 items-end gap-1.5">
          {daily.map((d) => (
            <li key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${d.active} active, ${d.new_users} new`}>
              <span className="text-xs tabular-nums text-ink-2">{d.active || ""}</span>
              <span className="w-full rounded-t bg-primary" style={{ height: `${(d.active / maxActive) * 100}%`, minHeight: d.active ? 3 : 0 }} />
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
              <li key={r.id} className="rounded-xl bg-subtle px-3 py-2">
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
