# 05 · Trust

> A board people rely on in a stressful moment is a target. Here is every way we could think of to abuse a room, and
> what stops it.

## Any member can write metadata, so nobody's metadata is believed

Live vote counts and seat lists ride on Nexconn message metadata, which is what lets every screen update in about a
second. But reading the Web SDK, we saw that `message.setMetadata()` is available to **any member of a community
channel**. A malicious visitor could rewrite "Confirmed by 3" as "Confirmed by 300".

So the server signs every state it writes, and browsers only believe signed state:

```
signature = Ed25519( serverKey, cardId + "|" + stateJSON )
```

- The private key lives only on the server ([`src/lib/server/signing.ts`](../src/lib/server/signing.ts)); browsers get
  the public key with their session.
- Every client verifies before showing anything ([`src/lib/shared/signature.ts`](../src/lib/shared/signature.ts)).
  Edited state fails verification. Real state copied onto a different card fails too, because the card ID is part of
  what was signed.
- A card or pool message with no valid signature is never shown as a card at all.
- The test [`signature.test.ts`](../src/lib/shared/signature.test.ts) signs with Node's crypto and checks that
  verification passes, and that a tampered tally, a replay onto another card and a garbage signature all fail.

We first verified with the browser's built-in WebCrypto Ed25519. Our own browser tests showed it is **missing in
Chrome before version 137**, so on many phones every card silently disappeared. We switched to the audited, pure
JavaScript [`@noble/ed25519`](https://github.com/paulmillr/noble-ed25519), which works everywhere
([chapter 10](../10_tested_for_real)).

## "Official" means official

- Staff from an airline, airport, railway or travel agency are verified by hand, then marked as agents by an admin
  call ([`/api/admin/agents`](../src/app/api/admin/agents/route.ts)).
- Their posts become Official cards: pinned first, labelled "Official · Air India", kept for at least 12 hours, and
  closed to voting.
- The organisation name lives **inside the signed state**, never in the message content. Sending the same JSON from
  a browser gets you nothing, because you can't sign it.

## Other ways a room could be abused

| Threat | What stops it |
|---|---|
| Someone posts a card pretending to be someone else | The server sends cards as their real author, and clients drop any card whose author doesn't match the Nexconn sender |
| Someone copies a real card to post it twice | Clients keep the first message for each card ID and ignore copies |
| Spam and flooding | Postgres-backed rate limits that hold across serverless instances (table below) |
| A rumour spreading as fact | Confidence thresholds, decay over time, disputes, and "Not confirmed yet" labels |
| Scam cab or hotel offers | No money in the app, a "meet somewhere public, agree the price first" note on every pool, and Report |
| Phone numbers and emails posted publicly | Gentle detection before sending: "Everyone here can read this. Share numbers privately." Blocked outright on the board and on pools |
| Harassment | Pseudonymous names, no profiles, Report on every message and card |
| Cross-site requests | Cookies are `SameSite=Lax`, and every API body must be `application/json`, which a cross-site form can't send |
| Brigading votes | One vote per person per card, and you can't vote on your own |

| Action | Limit per person |
|---|---|
| Post an update | 6 a minute, 40 an hour |
| Vote | 60 a minute |
| Share a cab or room | 4 per 10 minutes, at most 3 open at once |
| Claim a seat | 20 a minute |
| Join a room | 20 a minute |
| Rename yourself | 20 per 10 minutes |
| Report | 10 per 10 minutes |
| Start a session (per IP, since a whole terminal can share one) | 300 a minute |

Reports go to a moderation list on the private traction dashboard ([chapter 12](../12_run_it_yourself)).

## What this doesn't solve

Signing proves the server said something; it doesn't prove the crowd is right. Limbo can't check that someone is
really on the trip, and a determined group could still confirm something false. The design answers that with
visible uncertainty rather than pretend certainty.

**Next:** [06 · Fair shares →](../06_fair_shares)
