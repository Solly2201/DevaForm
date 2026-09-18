/**
 * Walking into the temple, in a real browser.
 *
 * The entry cannot be judged from code: it is a thing you do. So this
 * does it — loads the Studio cold, scrolls the way a customer scrolls,
 * and photographs what they would see at each point of the approach,
 * including the handover into the Studio at the end.
 *
 * Also checks the things a screenshot cannot: that nothing under the
 * entry scrolled, that no scrollbar appeared, that the composition is
 * actually centred, and that the Studio's own controls are unreachable
 * until the customer has arrived.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/qa-entry.mjs [--out name] [--width W] [--height H]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const runName = flag("out", "entry");
const width = Number(flag("width", 1600));
const height = Number(flag("height", 900));
const deity = flag("deity", "vishnu");
/**
 * Arrive before the statue does.
 *
 * The entry is the loading screen, and the interesting half of that
 * contract is the half a fast machine never reaches: a customer who
 * enters the sanctum while the body is still arriving must see the room
 * held with a lamp lit, not a blank screen or a frozen scene — and must
 * be let through the moment there is something to let them through to.
 */
const impatient = args.includes("--impatient");

const outDir = path.join(repo, "screenshots", runName);
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
  defaultViewport: { width, height },
});
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

const shoot = async (name) => {
  await writeFile(path.join(outDir, `${name}.png`), await page.screenshot({ type: "png" }));
  console.log(`  wrote ${name}.png`);
};

/** How far into the approach the entry says it is. */
const progress = () =>
  page.evaluate(() => {
    const layer = document.querySelector('[data-testid="stage-intro"]');
    return layer ? Number(layer.getAttribute("data-progress")) : null;
  });

/** Scroll the way a wheel does, and let the scene catch up. */
const roll = async (pixels, steps = 6) => {
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel({ deltaY: pixels / steps });
    await new Promise((r) => setTimeout(r, 40));
  }
  await new Promise((r) => setTimeout(r, 450));
};

if (impatient) {
  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1600 * 1024) / 8,
    uploadThroughput: (1600 * 1024) / 8,
  });
}

await page.goto(`${BASE}/studio/${deity}`, {
  waitUntil: impatient ? "domcontentloaded" : "networkidle0",
  timeout: 180_000,
});
await page.waitForSelector('[data-testid="stage-intro"]', {
  timeout: impatient ? 180_000 : 30_000,
});
await new Promise((r) => setTimeout(r, 1200));

const report = {};

// --- the doors ------------------------------------------------------------
report.atRest = await progress();
report.composition = await page.evaluate(() => {
  const style = getComputedStyle(document.documentElement);
  const left = parseFloat(style.getPropertyValue("--stage-frame-left"));
  const frameWidth = parseFloat(style.getPropertyValue("--stage-frame-w"));
  return {
    frameCentre: left + frameWidth / 2,
    windowCentre: window.innerWidth / 2,
    documentScrollable:
      document.documentElement.scrollHeight > document.documentElement.clientHeight,
    horizontalOverflow:
      document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
report.chromeHidden = await page.evaluate(() => {
  const clickable = [...document.querySelectorAll("button")].filter((node) => {
    const box = node.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    return !node.closest('[data-testid="stage-intro"]');
  });
  return clickable.length;
});
await shoot("1-doors");

if (impatient) {
  // Straight to the sanctum, then watch what a waiting customer sees.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('[data-testid="stage-intro"] button')].find(
      (node) => node.textContent?.trim().toLowerCase() === "enter",
    );
    button?.click();
  });
  // Wait until they have actually ARRIVED — the held frame is the state
  // under test, and a customer still walking in has not reached it.
  await page
    .waitForFunction(
      () => {
        const layer = document.querySelector('[data-testid="stage-intro"]');
        return !layer || Number(layer.getAttribute("data-progress")) >= 0.999;
      },
      { timeout: 30_000 },
    )
    .catch(() => null);
  report.waitingProgress = await progress();
  // The lamp fades up over 700 ms; reading it the instant they arrive
  // reads the start of that transition rather than the state.
  await new Promise((r) => setTimeout(r, 900));
  report.waitingSaysSo = await page.evaluate(() => {
    const live = document.querySelector('[data-testid="stage-intro"] [aria-live="polite"]');
    return live ? getComputedStyle(live).opacity : null;
  });
  await shoot("waiting");
  // …and that it is let through when the statue arrives, rather than
  // stranding anyone at a held frame.
  await page.waitForFunction(
    () => document.querySelector('[data-testid="stage-intro"]') === null,
    { timeout: 180_000 },
  );
  report.letThrough = true;
  await new Promise((r) => setTimeout(r, 1500));
  await shoot("let-through");
  await writeFile(
    path.join(outDir, "report.json"),
    JSON.stringify({ deity, width, height, impatient, report, consoleErrors }, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(consoleErrors.length ? 1 : 0);
}

// --- keyboard, and the way in for anyone who cannot scroll ---------------
await page.keyboard.press("Home");
await new Promise((r) => setTimeout(r, 500));
report.afterHome = await progress();
for (let i = 0; i < 3; i += 1) {
  await page.keyboard.press("ArrowDown");
  await new Promise((r) => setTimeout(r, 120));
}
await new Promise((r) => setTimeout(r, 450));
report.afterKeys = await progress();
// The Enter control: reachable by keyboard, and it completes the journey.
report.enterFocusable = await page.evaluate(() => {
  const button = [...document.querySelectorAll('[data-testid="stage-intro"] button')].find(
    (node) => node.textContent?.trim().toLowerCase() === "enter",
  );
  if (!button) return false;
  button.focus();
  return document.activeElement === button;
});
await page.evaluate(() => {
  const button = [...document.querySelectorAll('[data-testid="stage-intro"] button')].find(
    (node) => node.textContent?.trim().toLowerCase() === "enter",
  );
  button?.click();
});
// Only far enough to prove it moves: the handover is measured later, on
// a journey the customer actually scrolled.
await new Promise((r) => setTimeout(r, 260));
report.afterEnterButton = await progress();
await page.keyboard.press("Home");
await new Promise((r) => setTimeout(r, 700));

// --- slow, fast, and back out --------------------------------------------
await roll(600);
report.afterSlow = await progress();
await shoot("2-approach");

await roll(1400, 3);
report.afterFast = await progress();
await shoot("3-entering");

await roll(-700, 4);
report.afterReverse = await progress();
await shoot("4-backed-out");

await roll(3000, 8);
report.afterArriving = await progress();
await shoot("5-sanctum");

// --- the handover ---------------------------------------------------------
await new Promise((r) => setTimeout(r, 2600));
report.entryGone = await page.evaluate(
  () => document.querySelector('[data-testid="stage-intro"]') === null,
);
report.scrollTop = await page.evaluate(() => window.scrollY);
await shoot("6-studio");

// The Studio must actually be the customer's now.
report.studioButtons = await page.evaluate(
  () =>
    [...document.querySelectorAll("button")].filter((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    }).length,
);

await writeFile(
  path.join(outDir, "report.json"),
  JSON.stringify({ deity, width, height, report, consoleErrors }, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (consoleErrors.length) {
  console.error(`\n${consoleErrors.length} console error(s):`);
  for (const error of consoleErrors.slice(0, 10)) console.error(`  ${error}`);
}
await browser.close();
process.exit(consoleErrors.length ? 1 : 0);
