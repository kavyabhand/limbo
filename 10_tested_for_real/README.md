# 10 · Tested for real

> Every suite runs against a live server wired to a real Nexconn app. Nothing is mocked.

## The suites

| Suite | Command | Checks | What it proves |
|---|---|---|---|
| Unit tests | `npm test` | 20 | Trip keys, confidence and decay, the status line, Ed25519 signing and verification |
| [API](../tests/e2e/api.mjs) | `npm run e2e:api` | 32 | The whole server over HTTP with four separate guests: joining, validation, votes, superseding, pools, the race for the last seat, permissions, reports |
| [Live room](../tests/e2e/live-room.mjs) | `npm run e2e:live` | 9 | Three people in three browsers: a fact appears for the others, a ✓ and a dispute show up live, chat arrives, two people tap **Join** for one seat at the same moment |
| [Offline](../tests/e2e/offline.mjs) | `npm run e2e:offline` | 5 | One person loses Wi-Fi while another posts; the offline notice appears, and everything arrives when they reconnect |
| [Demo journey](../tests/e2e/demo-journey.mjs) | `npm run e2e:demo` | 12 | A judge's 90 seconds in the demo room on a phone, then on a laptop (`VIEWPORT=desktop`) and in dark mode (`THEME=dark`) |
| [Benchmark](../tests/bench/bench.mjs) | `npm run bench` | 30 races | Eight people claim the last seat at the same instant, 30 times; also times every API call. Writes [`report/data/bench.json`](../report/data/bench.json) |

`npm run e2e` runs all four end-to-end suites. Set `BASE_URL` to test a deployed site, and `SCREENSHOTS=<folder>` to
save screenshots; the ones in this README come from the demo suite.

Every push also runs typecheck, lint, the unit tests and a production build in
[GitHub Actions](../.github/workflows/ci.yml), with no secrets.

## Numbers from the latest run

| Measurement | Result |
|---|---|
| A fact posted by one person appears for another | about 1 s |
| A ✓ from one person updates the count for another | about 1 s |
| Eight simultaneous claims for the last seat, 30 trials | exactly one seat and seven on the waitlist, in 30 of 30 |
| Time for the offline notice to appear after Wi-Fi drops | under 0.1 s |
| Time to catch up on missed messages and updates after reconnecting | median 0.8 s over 11 runs (0.2–1.3 s) |
| Server time to post an update through Nexconn (p50 / p90) | 94 ms / 106 ms |
| Server time to claim a seat under an 8-way race (p50 / p90) | 118 ms / 346 ms |
| Demo room ready, from opening `/demo` | about 7 s on a development server |

## Bugs testing and review caught

Using the app like a real person, and reviewing it, found problems that reading the code didn't:

| Found | What was wrong | Fix |
|---|---|---|
| Every update vanished in an older Chrome | The browser's built-in Ed25519 only shipped in Chrome 137, so signatures couldn't be checked and every card was rejected | Verify with `@noble/ed25519`, which works in any browser |
| Report and Translate were unreachable on phones | They only appeared on mouse hover | They appear when you tap a message |
| Moving from one demo room to another could show the old room | The room's state was reused between two rooms | The room view is keyed by trip, so each room starts clean |
| The offline notice took more than 40 s | The SDK only notices a dead connection at its next heartbeat | Also listen to the browser's own `online` and `offline` events; catch up as soon as it's back |
| Pressing Post with an empty form seemed to do nothing | The error message was below the fold of the sheet | Errors sit right above the button |
| Grey secondary text and the orange buttons failed contrast checks (3.8:1) | Colour choice | Every colour measured; all now pass WCAG AA in both themes |
| White text on bright green in dark mode | Same colour token in both themes | A separate "text on colour" token per theme |
| Two people could end up in the same demo room | Random codes could collide | Codes are checked and retried |
| Phone numbers could be posted to the board through the API | The check only ran in the browser | The server enforces it too, and the API suite tests it |
| On the production build, phones opened scrolled down to the chat, hiding the status | Faster loading meant the room scrolled to the newest message after the status had rendered | Phones open at the top; the slim status bar appears as soon as the headline scrolls away |
| The "people here" count didn't change when someone new joined | It was only refreshed when an update or pool arrived | Refreshed when a new person appears, and every minute while the room is open (debounced, so a busy room isn't flooded) |
| Passengers on one airport Wi-Fi network could be locked out | Sessions were limited to 30 a minute per IP address, and a whole terminal can share one | 300 a minute per IP; per-person limits are unchanged |
| A single dropped request to Nexconn failed the action | Only one retry, on the backup domain | Primary, backup, then primary again after a short pause |

**Next:** [11 · The business →](../11_the_business)
