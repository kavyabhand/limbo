# 12 · Run it yourself

> Everything you need to run Limbo, test it, deploy it and look after it.

## You need

- **Node.js 22** or newer
- **PostgreSQL 14** or newer (locally, or a hosted one such as [Neon](https://neon.tech))
- A free **Nexconn** account and app, from the [Nexconn Console](https://console.nexconn.ai)
- **Google Chrome**, only for the browser test suites

## 1 · Set up Nexconn

1. Create an app in the Nexconn Console in the **Singapore** data centre, and copy its **App Key** and **App Secret**.
2. Under **Chat settings**, turn on:
   - **Community channel cloud retention** (community history doesn't work on the Web without it)
   - **Pre-join history access by new members**, for community channels and for group channels
   - **Translation** (Messages → Translation)
   - optionally, the **profanity filter**
3. If **domain allowlist for Web clients** is on, add your site's domain.

Using another data centre? Change `areaCode` in [`src/lib/client/chat.ts`](../src/lib/client/chat.ts) and the two
`NEXCONN_API_*` domains below to match.

## 2 · Configure

```bash
cp .env.example .env.local
```

| Variable | What it is |
|---|---|
| `NEXCONN_APP_KEY`, `NEXCONN_APP_SECRET` | From the console. The secret never leaves the server. |
| `NEXCONN_API_PRIMARY`, `NEXCONN_API_BACKUP` | Server API domains for your data centre (Singapore by default) |
| `DATABASE_URL` | `postgres://localhost/limbo` locally; a pooled connection string in production |
| `SESSION_SECRET` | 32+ random characters, signs the guest cookie: `openssl rand -base64 48` |
| `STATE_SIGNING_KEY` | Ed25519 private key that signs live state (command in `.env.example`) |
| `ADMIN_KEY` | Protects the traction dashboard and admin endpoints: `openssl rand -hex 24` |
| `APP_URL` | The site's public address, e.g. `http://localhost:3000` |

## 3 · Run

```bash
npm install
createdb limbo
npm run db:migrate        # applies db/schema.sql; safe to run again
npm run dev               # http://localhost:3000
```

Open `/` and type any flight number, or open `/demo`. Open the same room in a private window to be two people.

## 4 · Test

```bash
npm test                                   # unit tests
npm run e2e                                # all end-to-end suites, against the running app
npm run e2e:demo                           # one suite; also e2e:api, e2e:live, e2e:offline
VIEWPORT=desktop THEME=dark npm run e2e:demo
BASE_URL=https://your-site npm run e2e     # against a deployed site
SCREENSHOTS=shots npm run e2e:demo         # save screenshots
```

`CHROME_PATH` points the browser suites at a specific Chrome or Chromium, and `HEADED=1` shows the browser.

## 5 · Deploy

Limbo is a standard Next.js app and runs on [Vercel](https://vercel.com) as is:

1. Create a Postgres database (Neon, from the Vercel Marketplace, works well) and run `npm run db:migrate` against it.
   Pick the region next to your Nexconn data centre; the live site uses Singapore for both.
2. Import the repository into Vercel and add the environment variables above. `APP_URL` is optional on Vercel: it
   defaults to the project's production domain. [`vercel.json`](../vercel.json) runs the functions in Singapore
   (`sin1`), next to Nexconn's Singapore data centre.
3. Deploy, then run `BASE_URL=https://your-site npm run e2e`.

`/api/health` reports whether the database and the Nexconn Server API are reachable.

## 6 · Look after it

**Traction dashboard:** `/stats?key=ADMIN_KEY`. Real usage only (demo rooms and simulated passengers excluded): users,
rooms, rooms with 2+ people, updates, votes, pools, people who came back, daily active people, the busiest rooms, and
open reports. Any other key gets a 404.

**Verify a staff account** after checking who they are. They can read their ID at the bottom of **Settings** (the
**…** button in any room):

```bash
curl -X POST "$APP_URL/api/admin/agents" \
  -H "x-admin-key: $ADMIN_KEY" -H "content-type: application/json" \
  -d '{"userId":"u…","org":"Air India"}'      # "org": null removes it
```

## Where things are

```
src/
  app/                      pages and API routes (Next.js App Router)
    page.tsx                landing page
    r/[slug]/               a trip room, and its printable poster
    demo/                   starts a private demo room
    stats/                  private traction dashboard
    api/                    session, rooms, cards, votes, pools, reports, me, demo, admin, health
  components/
    room/                   the room: status, updates, pools, chat, composer, sheets
    landing/, ui.tsx        the landing form, shared UI (sheet, buttons, toasts)
  lib/
    shared/                 runs on both sides: trip keys, card protocol, confidence, board, signature checks
    server/                 Nexconn Server API client, database, sessions, rooms, cards, pools, demo, signing
    client/                 Nexconn Web SDK wrapper and the room store
db/schema.sql               the whole database, idempotent
tests/e2e/                  end-to-end suites against a live server
01_the_problem … 12_…       the story, one chapter per folder
```

**Back to:** [the start](../README.md)
