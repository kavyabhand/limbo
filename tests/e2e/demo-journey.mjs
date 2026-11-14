// The judge's journey: open the demo room alone and use every feature while the
// scripted, simulated passengers play out (about 90 seconds).  npm run e2e:demo
// VIEWPORT=desktop for a laptop-sized window; THEME=dark for dark mode.
import { BASE_URL, launch, person, shot, suite, visible } from "./_helpers.mjs";

const desktop = process.env.VIEWPORT === "desktop";
const viewport = desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const theme = process.env.THEME === "dark" ? "dark" : "light";
const tag = `${desktop ? "desktop" : "phone"}-${theme}`;
const t = suite(`Demo journey (${tag}) against ${BASE_URL}`);
const errors = [];
const browser = await launch();
const { page } = await person(browser, "judge", errors, viewport, theme);

await page.goto(`${BASE_URL}/`);
await page.waitForLoadState("networkidle");
await shot(page, `${tag}-01-home`);
await page.goto(`${BASE_URL}/demo`);

await t.step("demo room opens with a reported delay on the board", () => visible(page, "Delayed about 2 hours").waitFor({ timeout: 45000 }));
await shot(page, `${tag}-02-start`);
await t.step("someone posts the rebooking desk", () => visible(page, "Rebooking desk open at gate 12").waitFor({ timeout: 20000 }));
await t.step("judge confirms it with one tap", async () => {
  await page.locator('button[aria-label^="Confirm this"] >> visible=true').first().click();
  await page.locator('button[aria-pressed=true][aria-label^="You confirmed"] >> visible=true').first().waitFor({ timeout: 10000 });
});
await shot(page, `${tag}-03-confirmed`);
await t.step("a German message arrives translated", () => visible(page, "Translated from German").waitFor({ timeout: 30000 }));
await t.step("a shared hotel room appears with one spot left", () => visible(page, "1 spot left").waitFor({ timeout: 45000 }));
await shot(page, `${tag}-04-pool`);
await t.step("judge takes the last spot and the private group chat opens", async () => {
  await page.locator('button:text-is("Join") >> visible=true').first().click();
  await page.getByRole("dialog").getByText("In order of joining").waitFor({ timeout: 15000 });
});
await t.step("judge messages the group", async () => {
  const d = page.getByRole("dialog");
  await d.getByPlaceholder("Message this group").fill("hi, I'm at gate 12. meet at the exit?");
  await d.getByRole("button", { name: "Send" }).click();
  await d.getByText("meet at the exit?").waitFor({ timeout: 10000 });
});
await page.waitForTimeout(500);
await shot(page, `${tag}-05-group-chat`);
await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
await t.step("a Hindi message arrives translated", () => visible(page, "Translated from Hindi").first().waitFor({ timeout: 40000 }));
await t.step("the airline's official update is pinned", () => visible(page, "/Official · Demo Airlines/").waitFor({ timeout: 45000 }));
await t.step("the status settles: cancelled, everyone rebooked", () => visible(page, "Everyone moved to AI 103").waitFor({ timeout: 30000 }));
await page.waitForTimeout(1000);
await shot(page, `${tag}-06-chat`);
await page.evaluate(() =>
  document.querySelectorAll("div").forEach((d) => d.scrollHeight > d.clientHeight && getComputedStyle(d).overflowY === "auto" && (d.scrollTop = 0)),
);
await page.waitForTimeout(300);
await shot(page, `${tag}-07-status`);
await t.step("the + menu opens the post-an-update sheet", async () => {
  await page.getByRole("button", { name: "Post an update or share a ride" }).click();
  await shot(page, `${tag}-08-menu`);
  await page.getByRole("menuitem", { name: /Post an update/ }).click();
  await page.getByRole("dialog").getByText("How late?").waitFor({ timeout: 5000 });
  await shot(page, `${tag}-09-post`);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
});
await t.step("judge sends a message to the whole room", async () => {
  await page.getByLabel("Message everyone on this trip").fill("thanks everyone");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await visible(page, "thanks everyone").waitFor({ timeout: 10000 });
});

await browser.close();
t.done(errors);
