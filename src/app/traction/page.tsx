import type { Metadata } from "next";
import Link from "next/link";
import { getDaily, getTotals } from "@/lib/server/traction";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Traction",
  description: "Live usage numbers for Limbo, straight from the production database. Totals only: no names, rooms or messages.",
};

const fmt = (n: number) => n.toLocaleString("en-GB");

/**
 * Public traction page: live totals from production, no personal data. The same queries as the private dashboard,
 * so the two can never disagree.
 */
export default async function TractionPage() {
  const [t, daily] = await Promise.all([getTotals(), getDaily(14)]);
  const maxActive = Math.max(1, ...daily.map((d) => d.active));
  const activeLast7 = daily.slice(-7).reduce((n, d) => n + d.active, 0);

  const headline: [string, number, string][] = [
    ["People", t.users, "opened Limbo and got a guest identity"],
    ["In a real trip room", t.users_in_rooms, "joined at least one flight, train or bus room"],
    ["Trip rooms used", t.rooms, "rooms for real trips with at least one person"],
    ["Rooms with 2+ people", t.rooms_2plus, "strangers on the same trip who found each other"],
  ];
  const activity: [string, number][] = [
    ["Updates posted", t.cards],
    ["Confirmations and disputes", t.votes],
    ["Shared cabs and rooms", t.pools],
    ["Seats claimed", t.claims],
    ["Came back a day or more later", t.returning],
    ["Demo rooms opened", t.demo_runs],
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-16">
      <Link href="/" className="text-[0.95rem] font-semibold tracking-tight">
        Limbo
      </Link>

      <h1 className="mt-8 text-[2rem] leading-tight font-semibold tracking-tight">Traction</h1>
      <p className="mt-2 max-w-xl text-ink-2">
        Live numbers from the production app, counted on every visit. Totals only: no names, rooms or messages.
      </p>

      <section aria-label="People and rooms" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {headline.map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl bg-subtle p-4">
            <p className="text-[2rem] leading-none font-semibold tracking-tight tabular-nums">{fmt(value)}</p>
            <p className="mt-2 text-[0.9rem] font-medium">{label}</p>
            <p className="mt-0.5 text-[0.8rem] leading-snug text-ink-3">{hint}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="daily" className="mt-8 rounded-2xl border border-line p-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="daily" className="font-semibold">
            Active people per day
          </h2>
          <p className="text-[0.85rem] text-ink-3">
            {fmt(activeLast7)} in the last 7 days · UTC
          </p>
        </div>
        <ol className="mt-4 flex h-36 items-end gap-1.5" aria-label="Last 14 days">
          {daily.map((d) => (
            <li
              key={d.day}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              aria-label={`${d.day}: ${d.active} active, ${d.new_users} new`}
              title={`${d.day}: ${d.active} active, ${d.new_users} new`}
            >
              <span className="text-[0.7rem] text-ink-2 tabular-nums">{d.active || ""}</span>
              <span className="w-full rounded-t bg-primary" style={{ height: `${(d.active / maxActive) * 100}%`, minHeight: d.active ? 3 : 0 }} />
              <span className="text-[0.65rem] text-ink-3">{d.day.split(" ")[0]}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="activity" className="mt-8">
        <h2 id="activity" className="font-semibold">
          What people did
        </h2>
        <dl className="mt-2 divide-y divide-line">
          {activity.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between py-2.5">
              <dt className="text-ink-2">{label}</dt>
              <dd className="font-semibold tabular-nums">{fmt(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="how" className="mt-8 text-[0.9rem] leading-relaxed text-ink-2">
        <h2 id="how" className="font-semibold text-ink">
          How these are counted
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>The simulated passengers in demo rooms are never counted.</li>
          <li>
            Demo rooms are left out of every room, update, vote and seat figure. The people who open a demo are real, so
            they count as people, and the demos they opened are shown separately.
          </li>
          <li>Accounts created by our automated tests were removed before launch.</li>
          <li>Each person is one guest identity on one device, so someone using two devices counts twice.</li>
        </ul>
      </section>

      <p className="mt-10 text-[0.85rem] text-ink-3">
        Updated {new Date().toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
        <Link href="/" className="underline underline-offset-4">
          Open Limbo
        </Link>
      </p>
    </main>
  );
}
