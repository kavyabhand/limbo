// Three real people in one real trip room: live facts, votes, chat, and a race for
// the last seat. Everything travels through Nexconn.  npm run e2e:live
import { BASE_URL, launch, person, rand, suite, visible } from "./_helpers.mjs";

const t = suite(`Live room with three people against ${BASE_URL}`);
const errors = [];
const browser = await launch();
const [{ page: A }, { page: B }, { page: C }] = await Promise.all(["A", "B", "C"].map((n) => person(browser, n, errors)));
const code = `6E${1000 + rand(8999)}`;

await t.step(`A types flight ${code} and opens its room`, async () => {
  await A.goto(`${BASE_URL}/`);
  await A.getByLabel("Flight number").fill(code);
  await A.getByRole("button", { name: "Continue" }).click();
  await A.waitForURL(/\/r\//);
  await visible(A, "No updates yet").waitFor({ timeout: 30000 });
});
const url = A.url();
await t.step("B and C open the shared link and land in the same room", async () => {
  await Promise.all([B.goto(url), C.goto(url)]);
  await Promise.all([visible(B, "No updates yet").waitFor({ timeout: 30000 }), visible(C, "No updates yet").waitFor({ timeout: 30000 })]);
});

await t.step("A posts a gate change; B sees it live", async () => {
  await A.getByRole("button", { name: "Post an update or share a ride" }).click();
  await A.getByRole("menuitem", { name: /Post an update/ }).click();
  const d = A.getByRole("dialog");
  await d.getByRole("button", { name: "Gate", exact: true }).click();
  await d.getByLabel("What did you see or hear?").fill("Moved to gate 14");
  await d.getByRole("button", { name: "Post", exact: true }).click();
  await visible(B, "Moved to gate 14").waitFor({ timeout: 15000 });
});
await t.step("B confirms; A sees the count change live (signed metadata)", async () => {
  await B.locator('button[aria-label^="Confirm this"] >> visible=true').first().click();
  await visible(A, "1 confirmed").waitFor({ timeout: 15000 });
});
await t.step("C says it's not right; A sees the dispute live", async () => {
  await C.locator("button[aria-expanded] >> text=Moved to gate 14 >> visible=true").first().click();
  await C.locator('button:text-is("Not right") >> visible=true').first().click();
  await visible(A, "Disputed by 1").waitFor({ timeout: 15000 });
});
await t.step("B messages the room; A receives it", async () => {
  await B.getByLabel("Message everyone on this trip").fill("anyone sharing a cab to the city?");
  await B.getByRole("button", { name: "Send", exact: true }).click();
  await visible(A, "anyone sharing a cab to the city?").waitFor({ timeout: 15000 });
});
await t.step("A shares a 2-person cab (one spot for others)", async () => {
  await A.getByRole("button", { name: "Post an update or share a ride" }).click();
  await A.getByRole("menuitem", { name: /Share a cab or room/ }).click();
  const d = A.getByRole("dialog");
  await d.getByLabel("Going to").fill("City centre");
  for (let i = 0; i < 2; i++) await d.getByRole("button", { name: "Fewer people" }).click();
  await d.getByLabel("Total cost (optional)").fill("900");
  await d.getByRole("button", { name: "Share", exact: true }).click();
  await A.getByRole("dialog").getByText("In order of joining").waitFor({ timeout: 15000 });
  await A.getByRole("dialog").getByRole("button", { name: "Close" }).click();
});

const joinB = B.locator('button:text-is("Join") >> visible=true').first();
const joinC = C.locator('button:text-is("Join") >> visible=true').first();
await Promise.all([joinB.waitFor({ timeout: 15000 }), joinC.waitFor({ timeout: 15000 })]);
await Promise.all([joinB.click(), joinC.click()]);
await B.waitForTimeout(3000);
const inB = await B.getByRole("dialog").getByText("In order of joining").isVisible().catch(() => false);
const inC = await C.getByRole("dialog").getByText("In order of joining").isVisible().catch(() => false);
t.check(inB !== inC, `B and C tap Join at the same moment: exactly one gets the spot (B=${inB}, C=${inC})`);
await t.step("A sees the cab fill up live", () => visible(A, "Full").waitFor({ timeout: 15000 }));

await browser.close();
t.done(errors);
