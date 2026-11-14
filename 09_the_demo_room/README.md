# 09 · The demo room

> An empty room tells a first-time visitor nothing. The demo room shows Limbo alive without pretending it has users it
> doesn't have.

## What happens

Open **Try a demo room** (`/demo`). You get **your own** room, `DEMO` plus four digits, for a delayed flight. Eleven
simulated passengers and one simulated airline desk are already there, and a script plays out over about 80 seconds:

| After | What happens | What it shows |
|---|---|---|
| 0 s | Two passengers are chatting (one in Hindi); a delay is posted and three people confirm it | The status line: "Delayed about 2 hours" |
| 6 s | Someone finds the rebooking desk | A new update; you can confirm it |
| 12 s | Two more people confirm it | Counts changing live |
| 18 s | A German passenger asks about hotel vouchers | Translation |
| 24 s | Someone shares a hotel room for 3 | A pool with spots left |
| 34 s | Another passenger takes a spot, leaving the last one for you | Tap **Join** and the group chat opens |
| 46 s | A Hindi message about the desk | Translation |
| 56 s | If you took the last spot, the next person is put on the waitlist | Fair seats |
| 66 s | The airline posts an official cancellation and rebooking | The Official badge, pinned first |
| 78 s | Passengers confirm the new flight | The status settles: "Cancelled · Everyone moved to AI 103" |

A strip under the header explains each moment in one line ("Someone found the rebooking desk. Tap ✓ if you agree.")
and offers **Restart**, which opens a fresh room.

## It runs on the real stack

The simulated passengers are not a front-end trick. [`src/lib/server/demo.ts`](../src/lib/server/demo.ts) uses the
same code paths as real people: real Nexconn community and group channels, real `Limbo:Intel` and `Limbo:Pool`
messages, real signed metadata, real votes, real seat claims with the same row lock. Their chat messages are real
`RC:TxtMsg` messages sent through the Server API, and the translations you see come from Nexconn.

The script is driven by the visitor's browser ([`DemoDirector.tsx`](../src/components/room/DemoDirector.tsx)), one
step per call to `/api/demo/:roomId/step`. Each step runs exactly once and in order: the server only advances a demo
from step *n − 1* to *n*, so a reload or a double click can't repeat or skip anything. That also means it works on a
serverless host with no long-running timers.

## Rules for simulated people

1. **Always labelled.** Every demo room says "Demo" at the top, and its code starts with `DEMO`.
2. **Not counted.** Demo rooms and simulated users are excluded from every number on the traction dashboard
   ([chapter 11](../11_the_business)).
3. **Not active users.** Simulated passengers send through the Server API and never connect a client, so they never
   show up as Nexconn monthly active users. The person watching the demo does, because they are real.
4. **No effect on real rooms.** Each visitor gets their own room; simulated users only ever join demo rooms.

**Next:** [10 · Tested for real →](../10_tested_for_real)
