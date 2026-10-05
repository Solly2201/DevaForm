/**
 * The opening, on a slow connection.
 *
 * The wait before a 3D editor cannot be measured honestly on localhost
 * with a warm cache: every stage of it is over before a screenshot can be
 * taken, and the thing a customer complained about is invisible. So this
 * throttles the connection to something like a weak mobile link, walks
 * the opening, and records what is actually on screen at each stage it
 * can catch — with the stage name it was reporting at the time.
 *
 * It fails if the opening never appears (a gap nobody is covering), if it
 * never lifts (a cover hiding a failed asset), or if the page logged an
 * error on the way. A loading state that can hide a broken product is
 * worse than none.
 *
 * Prereq: a production server on localhost:3000 (`next start`).
 * Run:    node scripts/qa-opening.mjs [--kbps 400]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
const kbpsFlag = process.argv.indexOf("--kbps");
const KBPS = kbpsFlag >= 0 ? Number(process.argv[kbpsFlag + 1]) : 400;

const outDir = path.join(repo, "screenshots", "opening");
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
  ],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});

await page.setCacheEnabled(false);
const client = await page.target().createCDPSession();
await client.send("Network.enable");
await client.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 120,
  downloadThroughput: (KBPS * 1024) / 8,
  uploadThroughput: (KBPS * 1024) / 8,
});

const started = Date.now();
const seen = [];
page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded", timeout: 180_000 }).catch(() => null);

/**
 * Sample what the opening is saying, as often as a person would notice.
 *
 * Polling rather than waiting for each stage in turn: the stages are not
 * guaranteed to all occur — a fast enough machine skips one — and a run
 * that hangs waiting for a stage that will not come reports nothing about
 * the ones that did.
 */
let lifted = 0;
let entered = false;
for (let i = 0; i < 600; i += 1) {
  /**
   * Walk through the entry, once, the way a customer does.
   *
   * The entry is a door the customer opens at their own pace, and behind
   * it the opening is still working. A run that never knocks measures how
   * long the Studio takes to be ready for somebody who never arrived.
   */
  if (!entered) {
    entered = await page
      .evaluate(() => {
        const button = [...document.querySelectorAll('[data-testid="stage-intro"] button')].find(
          (node) => node.textContent?.trim().toLowerCase() === "enter",
        );
        if (!button) return false;
        button.click();
        return true;
      })
      .catch(() => false);
  }
  const stage = await page
    .$eval('[data-testid="temple-opening"]', (node) => node.getAttribute("data-stage"))
    .catch(() => null);
  const at = Date.now() - started;
  if (stage) {
    const last = seen[seen.length - 1];
    if (!last || last.stage !== stage) {
      seen.push({ stage, atMs: at });
      await page.screenshot({ path: path.join(outDir, `${seen.length}-${stage}.png`) });
    }
  } else if (seen.length > 0) {
    lifted = at;
    break;
  }
  await new Promise((r) => setTimeout(r, 120));
}

await page.screenshot({ path: path.join(outDir, "9-studio.png") });

const report = { kbps: KBPS, enteredTheSanctum: entered, stages: seen, liftedMs: lifted, errors };
await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));

await browser.close();

const problems = [];
if (seen.length === 0) problems.push("the opening never appeared");
if (lifted === 0) problems.push("the opening never lifted");
if (errors.length > 0) problems.push(`${errors.length} console error(s)`);
if (problems.length > 0) {
  console.error(`\nFAILED: ${problems.join("; ")}`);
  process.exit(1);
}
console.log(`\nopening lifted after ${lifted} ms at ${KBPS} kbps -> screenshots/opening`);
