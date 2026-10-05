/**
 * Does the lighting control actually light anything?
 *
 * A row of sliders that move numbers nobody reads is the standard way a
 * "customisable" feature ships broken, and from outside it looks exactly
 * like one that works. `studioLighting.test.ts` holds the resolving to
 * numbers; this drives the real Studio in a real browser, moves each
 * control to an end, and photographs the result — which is the half that
 * a pure test cannot do.
 *
 * It also reads back what the browser STORED, because the other way this
 * feature fails quietly is by working beautifully until a reload.
 *
 * Prereq: `pnpm dev` on localhost:3000, Chrome installed.
 * Run:    node scripts/qa-lighting.mjs <out-dir>
 */
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
const OUT = process.argv[2];
if (!OUT) {
  console.error("usage: node scripts/qa-lighting.mjs <out-dir>");
  process.exit(2);
}
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
  ],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
page.on("console", (message) => {
  if (message.type() === "error") console.log("ERR", message.text().slice(0, 200));
});
// Past the entry overlay the way a returning customer goes: the stage
// records that it has been seen, and this says it has.
await page.evaluateOnNewDocument(() => {
  sessionStorage.setItem("devaform.stage.introSeen", "1");
});
await page.goto(`${BASE}/studio`, { waitUntil: "networkidle0", timeout: 180_000 });
await page.waitForFunction(() => window.__devaformUi, { timeout: 90_000 });
await new Promise((resolve) => setTimeout(resolve, 4000));

const shot = async (name) => {
  // The rig settles over a frame or two; photographing before it has is
  // how a sheet comes back showing the state before the one it names.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  wrote ${name}.png`);
};
const drive = (fn) => page.evaluate(fn);

await shot("01-default");
await drive(() => {
  const chip = [...document.querySelectorAll("button")].find(
    (button) => /Light/i.test(button.textContent ?? ""),
  );
  chip?.click();
});
await shot("02-panel-open");
await drive(() => window.__devaformUi.getState().setLightingPreset("studio"));
await shot("03-studio-preset");
await drive(() => window.__devaformUi.getState().setLightingValue("key", 0.15));
await shot("04-key-down");
await drive(() => {
  const ui = window.__devaformUi.getState();
  ui.resetLighting();
  ui.setLightingValue("warmth", -1);
});
await shot("05-cool");
await drive(() => {
  const ui = window.__devaformUi.getState();
  ui.resetLighting();
  ui.setLightingValue("exposure", 1.7);
});
await shot("06-exposure-up");
await drive(() => {
  const ui = window.__devaformUi.getState();
  ui.resetLighting();
  ui.setLightingShadows(false);
});
await shot("07-no-shadows");

/**
 * Set something a preset would not produce, so the read-back is about
 * THIS customer's choice rather than about a default that happens to
 * agree with it.
 */
await drive(() => {
  const ui = window.__devaformUi.getState();
  ui.setLightingPreset("temple");
  ui.setLightingValue("key", 0.42);
  ui.setLightingValue("warmth", -0.75);
  ui.setLightingShadows(false);
});
await shot("08-custom");

const persisted = await page.evaluate(() => ({
  stored: localStorage.getItem("devaform.studio.presentation"),
  live: window.__devaformUi.getState().lighting,
}));
if (!persisted.stored) {
  console.error("FAIL: nothing was persisted; the lighting would be lost on reload");
  process.exitCode = 1;
}

/**
 * AND THEN ACTUALLY RELOAD.
 *
 * Checking that something was WRITTEN is not the same as checking that it
 * comes back, and this file's own opening paragraph says the way this
 * feature fails quietly is "by working beautifully until a reload". It
 * was only ever testing the write.
 */
await page.reload({ waitUntil: "networkidle0", timeout: 180_000 });
await page.waitForFunction(() => window.__devaformUi, { timeout: 90_000 });
await new Promise((r) => setTimeout(r, 4000));
const restored = await page.evaluate(() => window.__devaformUi.getState().lighting);
await shot("09-after-reload");

const differences = Object.entries(persisted.live)
  .filter(([key, value]) => restored?.[key] !== value)
  .map(([key, value]) => `${key}: set ${JSON.stringify(value)}, came back ${JSON.stringify(restored?.[key])}`);
console.log(JSON.stringify({ set: persisted.live, afterReload: restored, differences }, null, 2));
if (differences.length > 0) {
  console.error(`FAIL: lighting did not survive a reload — ${differences.join("; ")}`);
  process.exitCode = 1;
}
await browser.close();
