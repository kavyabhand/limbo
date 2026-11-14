// Shared helpers for the end-to-end suites.
//
// Every suite runs against a live Limbo server (local or deployed) wired to a real
// Nexconn app. Nothing is mocked: messages, metadata and group channels all go
// through Nexconn.
//
//   BASE_URL     server to test (default http://localhost:3000)
//   CHROME_PATH  Chrome/Chromium binary; otherwise the installed Google Chrome is used
//   SCREENSHOTS  folder to save screenshots into (optional)
//   HEADED=1     show the browser
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

export const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SCREENSHOTS = process.env.SCREENSHOTS ?? null;
if (SCREENSHOTS) mkdirSync(SCREENSHOTS, { recursive: true });

export function launch() {
  const where = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" };
  return chromium.launch({ ...where, headless: !process.env.HEADED });
}

/** A fresh, isolated browser profile (its own cookies = its own guest). */
export async function person(browser, name, errors, viewport = { width: 390, height: 844 }, colorScheme = "light") {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme, locale: "en-GB" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name} console: ${m.text().slice(0, 200)}`));
  page.on("response", (r) => r.url().includes("/api/") && r.status() >= 500 && errors.push(`${name}: HTTP ${r.status()} ${r.url()}`));
  return { context, page };
}

/** The first *visible* element containing this text (the desktop board is hidden on phones and vice versa). */
export const visible = (page, text) => page.locator(`text=${text} >> visible=true`).first();

export async function shot(page, name) {
  if (SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}/${name}.png` });
}

/** Step logger with timings and a pass/fail tally. Exits non-zero if anything failed. */
export function suite(title) {
  const t0 = Date.now();
  let failed = 0;
  let passed = 0;
  const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`;
  console.log(`\n${title}\n${"-".repeat(title.length)}`);
  return {
    pass(msg) {
      passed++;
      console.log(`${stamp()}  PASS  ${msg}`);
    },
    fail(msg, detail) {
      failed++;
      console.log(`${stamp()}  FAIL  ${msg}${detail ? `\n         ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
    },
    check(cond, msg, detail) {
      if (cond) this.pass(msg);
      else this.fail(msg, detail);
    },
    /** Await a step; a timeout counts as a failure instead of crashing the suite. */
    async step(msg, fn) {
      try {
        await fn();
        this.pass(msg);
        return true;
      } catch (err) {
        this.fail(msg, err.message.split("\n")[0]);
        return false;
      }
    },
    done(errors = []) {
      if (errors.length) {
        console.log(`\nBrowser errors:\n  ${errors.join("\n  ")}`);
        failed += errors.length;
      }
      console.log(`\n${passed} passed, ${failed} failed (${stamp().trim()})`);
      process.exitCode = failed ? 1 : 0;
    },
  };
}

export const today = () => new Date().toISOString().slice(0, 10);
export const rand = (n) => Math.floor(Math.random() * n);
