# 06 · Fair shares

> Two people tap the last seat in a cab at the same moment. Exactly one of them gets it, and both see the same answer.

## Sharing a cab, a room or a meal

Anyone in a room can tap **+ → Share a cab or room**, then say where, how many people in total (2 to 8, including
themselves) and, optionally, the total cost and a time. The card shows the split as people join ("₹350 each") and how
many spots are left. Limbo never handles money: people pay each other however they like.

## How the last seat is decided

[`src/lib/server/pools.ts`](../src/lib/server/pools.ts), inside one Postgres transaction:

```
select … from pools where id = $1 for update        -- every claim for this pool waits here, one at a time
already a member?            → "already"           (tapping twice is harmless)
seats taken < capacity?      → insert member        → "seat"   (full if that was the last one)
otherwise                    → join the waitlist    → "waitlisted"
version + 1, commit
```

The row lock serialises concurrent claims, so the order is decided by the database, not by whichever phone's request
happened to be processed first by some other path. Once the transaction commits, the server:

1. adds the person to the pool's private **Nexconn group channel**,
2. posts a short notice there ("Quiet Heron joined"),
3. writes the new signed seat list to the pool card's metadata, so everyone in the room sees "Full" at the same
   moment.

## Leaving, waiting and promotion

- **Leave**: a seat holder gives up their place. In the same transaction, the first person on the waitlist (by the
  time they joined it) is moved in, added to the group chat, and the room sees the change.
- **Leave the waitlist** at any time.
- **The organiser can't simply leave.** They mark the pool as done, or cancel it, which clears the waitlist.
- Closed pools take no new claims.

## A private group for each pool

Every pool gets its own Nexconn group channel, created with `joinPerm: 3`: nobody can join it from a client, only
through the server when they win a seat. Its ID is only sent to people holding a seat. That is where people agree
where to meet and swap numbers, away from the public room.

## Tested with a real race

The API suite fires two claims for the last seat at the same instant; the browser suite has two people tap **Join** at
the same moment. In every run, exactly one gets the seat and the other is waitlisted
([chapter 10](../10_tested_for_real)). The losing side sees: *"It just filled up. You're on the waitlist."*

**Next:** [07 · Every language →](../07_every_language)
