// Airport Wi-Fi drops. A goes offline while B posts; A must notice at once and
// catch up on everything when back online.  npm run e2e:offline
import { BASE_URL, launch, person, rand, suite, today, visible } from "./_helpers.mjs";

const t = suite(`Offline and catch-up against ${BASE_URL}`);
const errors = [];
const browser = await launch();
const a = await person(browser, "A", errors);
const { page: B } = await person(browser, "B", errors);
const A = a.page;
const url = `${BASE_URL}/r/train-${10000 + rand(89999)}-${today()}`;

await t.step("A and B open the same train room", async () => {
  await A.goto(url);
  await B.goto(url);
  await visible(A, "No updates yet").waitFor({ timeout: 30000 });
  await visible(B, "No updates yet").waitFor({ timeout: 30000 });
});
await t.step("a half-filled update shows its error right above the button", async () => {
  await A.getByRole("button", { name: "Post an update or share a ride" }).click();
  await A.getByRole("menuitem", { name: /Post an update/ }).click();
  await A.getByRole("dialog").getByRole("button", { name: "Post", exact: true }).click();
  await A.getByRole("dialog").getByRole("alert").waitFor({ timeout: 5000 });
  await A.getByRole("dialog").getByRole("button", { name: "Close" }).click();
});

await a.context.setOffline(true);
await t.step("A's Wi-Fi drops: the offline notice appears within 5 seconds", () => visible(A, "You're offline").waitFor({ timeout: 5000 }));
await t.step("meanwhile B posts a platform change and a message", async () => {
  await B.getByRole("button", { name: "Post an update or share a ride" }).click();
  await B.getByRole("menuitem", { name: /Post an update/ }).click();
  const d = B.getByRole("dialog");
  await d.getByRole("button", { name: "Gate", exact: true }).click();
  await d.getByLabel("What did you see or hear?").fill("Now platform 4");
  await d.getByRole("button", { name: "Post", exact: true }).click();
  await d.waitFor({ state: "hidden", timeout: 10000 });
  await B.getByLabel("Message everyone on this trip").fill("train moved to platform 4, hurry!");
  await B.getByRole("button", { name: "Send", exact: true }).click();
  await visible(B, "train moved to platform 4, hurry!").waitFor({ timeout: 10000 });
});
await a.context.setOffline(false);
const back = Date.now();
await t.step("A reconnects and catches up on the message and the update", async () => {
  await visible(A, "train moved to platform 4, hurry!").waitFor({ timeout: 45000 });
  await visible(A, "Now platform 4").waitFor({ timeout: 10000 });
});
console.log(`         caught up ${((Date.now() - back) / 1000).toFixed(1)}s after reconnecting`);

await browser.close();
t.done(errors);
