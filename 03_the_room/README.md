# 03 · The room

> Your trip number is the address. The room is waiting there before you arrive.

## A trip number is a key

[`src/lib/shared/trip.ts`](../src/lib/shared/trip.ts) turns whatever someone types into one canonical trip:

| Typed | Mode | Canonical | Room key | Nexconn channel |
|---|---|---|---|---|
| `ai-101 `, 14 Dec | Flight | `AI101` | `flight:AI101:2026-12-14` | `lbfAI10120261214` |
| `12627`, 14 Dec | Train | `12627` | `train:12627:2026-12-14` | `lbt1262720261214` |
| `KSRTC MYS 2230` | Bus | `KSRTCMYS2230` | `bus:KSRTCMYS2230:…` | `lbbKSRTCMYS2230…` |

- Case, spaces and dashes don't matter, so `ai-101` and `AI 101` land in the same room.
- Flights are checked against the airline-code pattern (`AI 101`, `6E 2134`, `BAW9A`) and trains against the 5-digit
  Indian Railways format. Anything unusual is still allowed after a "we don't recognise this, continue anyway?" step,
  because a wrong regex should never lock someone out of their own room.
- Dates are accepted from three days ago to two months ahead.
- The channel ID uses only letters and digits and stays under 64 characters, which is what Nexconn requires.

The room's URL is just the trip (`/r/flight-AI101-2026-12-14`), so a link or a QR code on a printed poster
([`/r/…/poster`](../src/app/r/[slug]/poster/page.tsx)) takes anyone straight in.

## The first visit creates it

[`src/lib/server/rooms.ts`](../src/lib/server/rooms.ts) handles joining:

1. **Upsert the room row** in Postgres (`insert … on conflict do nothing`). Two people opening a brand-new room at the
   same moment get the same row.
2. **Make sure the Nexconn community channel exists.** If the room is new, the server calls
   `community-channel/create` with the visitor as the first member. We found by probing the live API that create and
   join are both idempotent (a repeat returns success), so the race between two first visitors is harmless: whoever
   loses simply joins ([chapter 08](../08_how_nexconn_is_used#what-we-learned-by-probing-the-live-api)).
3. **Join the visitor** with `community-channel/join` and record the membership, so the next visit skips Nexconn
   entirely.

Rooms become read-only three days after the travel date.

## Guests, with no sign-up

[`src/lib/server/session.ts`](../src/lib/server/session.ts):

- A visitor gets a random user ID (`u` + 20 characters from a 57-letter alphabet, about 116 bits, with no modulo bias)
  that is also their Nexconn user ID.
- It lives in an **HMAC-signed, httpOnly cookie**. Nothing personal is collected: no phone, no email, no real name.
- They get a calm generated name ("Quiet Heron") and colour, and can rename themselves at any time.
- Their language is taken from the browser's `Accept-Language` and can be changed in settings.

Every time the page loads, [`/api/session`](../src/app/api/session/route.ts) mints a fresh Nexconn access token
with the Server API. The App Secret never leaves the server, and tokens are never stored.

## Connecting the browser

[`src/lib/client/chat.ts`](../src/lib/client/chat.ts) wraps the Web SDK:

- It is imported lazily, because the SDK only runs in a browser.
- `NCEngine.initialize` runs once, with the Singapore area code.
- The three custom message types are registered **before** `connect`, as the docs require.
- `connect` is called once and shared by concurrent callers, which matters because React's development mode mounts
  every component twice.

[`src/lib/client/room-store.ts`](../src/lib/client/room-store.ts) then runs the room: session, join, connect, then the
current state and the latest page of history in parallel. After that, everything arrives live.

**Next:** [04 · The board →](../04_the_board)
