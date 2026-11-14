# 11 · The business

> Free for travellers, always. Paid for by the people who want calmer, better-informed passengers.

## Who pays

| Customer | What they get | How they'd pay |
|---|---|---|
| **Airlines and railways** | One verified voice in every affected room: post once, and every stranded passenger sees it pinned, in their own language. Fewer people at the desk and on the phone asking the same question. | Subscription per carrier, or per disruption |
| **Airports and stations** | Official updates for every room touching their terminal; a live picture of where crowds are stuck and what they're asking | Annual licence |
| **Travel agencies and booking sites** | Rooms for their customers' trips; coordinating rebookings for everyone on a cancelled flight | Per-seat software subscription |
| **Ground transport and hotels** | Clearly labelled offers shown to people who are stuck right now | Per lead, or sponsored placement |
| **Travel insurers** | Aggregate evidence of a disruption, and claims guidance posted as updates | Partnership |

Travellers never pay and never see ads in the conversation. The network is the people in it.

## Why it spreads on its own

1. **The link and the QR code.** Every room has a printable poster. One person sticks it near the gate or the
   platform, or drops the link in a family group, and the next person arrives with nothing to install.
2. **Shared cabs and rooms.** Each pool pulls in strangers who need the link to claim a seat.
3. **Official updates.** When staff post, passengers come to read them, and staff see the audience is there.
4. **Seasons.** North Indian winter fog, monsoon floods, holiday peaks and storms create predictable surges.
5. **Before anything goes wrong.** People can open the room for tomorrow's trip just to see who else is on it, and are
   already there when the delay comes.

## Why it's good for Nexconn

- Each disruption brings **hundreds of active users in a burst**, every one of them a real chat user.
- Disruptions recur, so the same rooms fill again every season.
- Verified staff mean **organisations** on the platform, not just individuals.
- It exercises most of the product: community channels, group channels, custom messages, metadata, history,
  translation and the Server API.

## What it would cost to run

Nexconn bills by monthly active users. Community channels need the Free or Pro plan (Starter doesn't include them):

| Monthly active users | Nexconn plan | Per month |
|---|---|---|
| up to 10,000 | Free Chat Plan from the challenge (one year) | $0 |
| 25,000 | Pro | $1,960 |
| 100,000 | Pro | $7,160 |

Translation is billed separately at $0.02 per 1,000 characters after the free allowance. Hosting (Vercel) and the
database (Neon) fit comfortably in free tiers at the start.

## Traction

Measured from real rooms only: demo rooms and simulated passengers are excluded. The private dashboard at
`/stats?key=…` shows real users, rooms used, rooms with two or more people, updates, votes, shared cabs and rooms,
seats claimed, people who came back, and daily active people.

<!-- Fill in from /stats and the Nexconn console before submitting. -->

| | |
|---|---|
| Real users | — |
| Trip rooms used | — |
| Rooms with 2+ people | — |
| Updates posted · votes | — |
| Shared cabs and rooms · seats claimed | — |
| Nexconn monthly active users (console) | — |

**Next:** [12 · Run it yourself →](../12_run_it_yourself)
