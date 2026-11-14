# 08 · How Nexconn is used

> Limbo has no WebSocket server of its own. Every message, every live vote count and every seat list travels through
> Nexconn.

## The shape of it

```
 Browser (Next.js + @nexconn/chat)            Limbo server (Next.js API + Postgres)          Nexconn
 ─────────────────────────────────            ──────────────────────────────────────          ───────
 POST /api/session ─────────────────────────► mint access token ───────────────────────────► Server API
 NCEngine.connect(token) ◄───────────────────────────────────────────────────────────────────► realtime
 chat: CommunitySubChannel.sendMessage ◄─────────────────────────────────────────────────────► community channel
 post update ──► POST /api/…/cards ─────────► validate, store, send Limbo:Intel + signed state ► community channel
 tap ✓ ────────► POST /api/…/vote ──────────► recount in Postgres, set signed metadata ───────► metadata event to all
 claim seat ───► POST /api/…/claim ─────────► row lock, join group, set metadata ────────────► group channel
 translate ◄──────────────────────────────────────────────────────────────────────────────────► built-in translation
```

## Web SDK (`@nexconn/chat` and `@nexconn/engine` 26.2.1)

| Call | What Limbo uses it for | Code |
|---|---|---|
| `NCEngine.initialize({ appKey, areaCode: SG })` | Once per page | [`chat.ts`](../src/lib/client/chat.ts) |
| `NCEngine.registerCustomMessages` | `Limbo:Intel`, `Limbo:Pool`, `Limbo:Notice`, before connecting | [`chat.ts`](../src/lib/client/chat.ts) |
| `NCEngine.connect` and `ConnectionStatusHandler` | Connect with the server-minted token; drive the "offline" and "reconnecting" states | [`chat.ts`](../src/lib/client/chat.ts) |
| `MessageHandler.onMessageReceived` | Chat, updates, pools and notices, live | [`room-store.ts`](../src/lib/client/room-store.ts) |
| `MessageHandler.onCommunityChannelMessageMetadataChanged` | Live vote counts and seat lists (verified before use) | [`room-store.ts`](../src/lib/client/room-store.ts) |
| `MessageHandler.onMessageMetadataUpdated`, `onMessageDeleted` | Metadata on other channel types; removed messages | [`chat.ts`](../src/lib/client/chat.ts) |
| `CommunitySubChannel(id, "RCDefault").sendMessage(SendTextMessageParams)` | Room chat, with the sender's name, colour and language | [`room-store.ts`](../src/lib/client/room-store.ts) |
| `BaseChannel.createMessagesQuery` and `loadNextPage` | History when you arrive, "Earlier messages", and catching up after a reconnect | [`room-store.ts`](../src/lib/client/room-store.ts) |
| `GroupChannel(id).sendMessage` and history | The private chat for each shared cab or room | [`PoolChatSheet.tsx`](../src/components/room/PoolChatSheet.tsx) |
| `translateModule.translateMessages` and `TranslateHandler` | Translation of chat and updates | [`room-store.ts`](../src/lib/client/room-store.ts) |

## Server API (signed requests, primary and backup domains)

Limbo has its own small, typed client ([`src/lib/server/nexconn.ts`](../src/lib/server/nexconn.ts)): every request is
signed with `SHA1(AppSecret + Nonce + Timestamp)`, times out after 6 seconds, and fails over to the backup domain on
network errors and 5xx, as the docs recommend.

| Endpoint | Used for |
|---|---|
| `/v4/auth/access-token/issue` | A token for each guest, minted per session and never stored |
| `/v4/user/update` | Keeping a guest's name in sync for push notifications |
| `/v4/community-channel/create`, `/join` | Creating a trip room on first visit, adding each visitor |
| `/v4/community-channel/message/send` | Sending updates and pools as the author, with `hasMetadata: true` and the initial signed state |
| `/v4/community-channel/message/metadata/set` | Every vote and seat change |
| `/v4/group-channel/create`, `/join`, `/leave` | The private group for each pool |
| `/v4/group-channel/message/send` | Notices in the pool's group ("Quiet Heron joined") |

## Console settings it needs

- **Community channel cloud retention**, without which community history doesn't work on the Web.
- **Pre-join history** for community and group channels, so latecomers see what happened before they arrived.
- **Translation**, which is off by default.

## What we learned by probing the live API

Before building on them, we called the endpoints against a real app to see what they actually do:

| Finding | Why it mattered |
|---|---|
| `community-channel/create` returns success when the channel already exists, and `join` returns success when you're already a member | Two people opening a brand-new room at once can't break it; the loser of the race simply joins |
| `join` also returns success for a channel that doesn't exist | Membership can't be inferred from `join`, so Limbo tracks whether each room's channel was created |
| Server-sent text messages use `{ "content": …, "user": … }`; the Web SDK exposes them as `{ text, senderUserInfo }` | The demo's simulated passengers send real text messages that render like anyone else's |
| Metadata set by the server is delivered to every connected client within about a second | Live tallies without a WebSocket server of our own |
| The Web docs spell the registration option `isPersited`; the installed type definitions say `isPersisted` | We went with the type definitions |
| `message.setMetadata()` is available to every member of a community channel | The reason all state is signed ([chapter 05](../05_trust)) |

## The free plan, in numbers

From Nexconn's pricing page, and worth knowing before launching anything:

- 2,000 monthly active users and 100 people connected at once on the standard Free plan. The challenge's Free Chat
  Plan raises this to 10,000 monthly active users for a year.
- 10,000 translated characters a month unless a card is attached, hence the per-device cache and the length and age
  limits on automatic translation.
- Simulated demo passengers send through the Server API but never connect a client, so they don't count as active
  users ([chapter 09](../09_the_demo_room)).

**Next:** [09 · The demo room →](../09_the_demo_room)
