# 04 · The board

> A room of two hundred anxious people produces a lot of noise. The value is the small set of things that are actually
> true.

## What you see

At the top of every room, in plain words:

> **Delayed about 2 hours**
> Rebooking desk open at gate 12
> Confirmed by 4 people

Below it, the updates people have posted, each on one line with a **✓ count**. One tap confirms. Tapping the update
itself shows who posted it, the original language, and two more actions: **Not right** and **Report**.

## An update is a custom message

When someone posts "Rebooking desk open at gate 12", the browser calls
[`/api/rooms/:id/cards`](../src/app/api/rooms/[id]/cards/route.ts). The server
([`src/lib/server/cards.ts`](../src/lib/server/cards.ts)) validates it, stores it, and **sends it into the room as a
`Limbo:Intel` custom message from the author**, with its live state attached as message metadata:

```jsonc
// content (what was said)                    // metadata (what people think of it), signed by the server
{ "v": 1, "cardId": "…", "kind": "desk",      { "s":   "{\"ver\":4,\"confirms\":3,\"disputes\":0,…}",
  "text": "Rebooking desk open at gate 12",     "sig": "<Ed25519 signature over cardId|s>" }
  "source": "saw_myself", "lang": "en",
  "author": { "id": "u…", "name": "Quiet Heron" },
  "createdAt": …, "expiresAt": … }
```

Sending through the server, not the browser, lets it rate-limit, reject phone numbers, attach the signed state in the
same call, and mark Official posts ([chapter 05](../05_trust)).

## A vote is a recount, not an increment

Tapping ✓ calls [`/vote`](../src/app/api/rooms/[id]/cards/[cardId]/vote/route.ts). Inside one database transaction
the server locks the card, upserts this person's vote (one per person, changeable), **recounts from the votes
table**, and bumps a version number. It then writes the new signed state to the message's metadata with the Server
API. Nexconn pushes that to every member through `onCommunityChannelMessageMetadataChanged`, so every screen updates
in about a second. If two updates arrive out of order, clients keep the higher version.

You can't confirm your own update, and official updates can't be voted on.

## Confidence you can explain in one sentence

[`src/lib/shared/confidence.ts`](../src/lib/shared/confidence.ts):

```
raw        = confirmations − 1.25 × disputes
decay      = 0.5 ^ (time since the last confirmation ÷ half-life)
confidence = raw × decay
```

The thresholds scale with the size of the room, so three people aren't stuck with an empty board:

| People in the room | "Likely" from | "Confirmed" from |
|---|---|---|
| up to 5 | 1 | 2 |
| up to 25 | 1.5 | 3 |
| more | 1.5 | 4 |

High-stakes kinds (cancellations, rebookings, refunds) need 1.5 times as much. An update is **disputed** once enough
people have voted and the disputes outweigh 60% of the confirmations.

Different facts go stale at different speeds:

| Kind | Lives for | Half-life | A newer one replaces it? |
|---|---|---|---|
| Delay | 2 h | 45 min | yes |
| Gate / platform | 90 min | 30 min | yes |
| Desk | 3 h | 60 min | no |
| Food | 3 h | 90 min | no |
| Safety | 4 h | 2 h | no |
| Cancelled | 24 h | 6 h | no |
| Rebooking | 24 h | 3 h | yes |
| Refund | 24 h | 6 h | no |
| Other | 2 h | 45 min | no |

A fresh, undisputed report of a gate change can appear on the board before anyone confirms it, clearly marked "Not
confirmed yet", because an early warning matters more than certainty. A vague "other" report never appears there until
people confirm it.

## The status line

[`src/lib/shared/board.ts`](../src/lib/shared/board.ts) turns all of that into one headline, in order of priority:

1. A confirmed or official **cancellation**: "Cancelled".
2. Otherwise the latest **delay** estimate: "Delayed about 2 hours" (or "On time").
3. Otherwise an unconfirmed cancellation: "Possibly cancelled".
4. The second line is the best-confirmed **rebooking** or **desk** update.
5. The third line says how sure we are: "Official update from …", "Confirmed by 4 people", "Reported, not confirmed
   yet".

All of this is pure code, run identically in every browser from the same signed state, and covered by unit tests
([`confidence.test.ts`](../src/lib/shared/confidence.test.ts), [`board.test.ts`](../src/lib/shared/board.test.ts)).

**Next:** [05 · Trust →](../05_trust)
