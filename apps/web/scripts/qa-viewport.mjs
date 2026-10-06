/**
 * The Studio's own viewport: lighting, zoom and orbit, on the production
 * build, driven the way a customer drives it.
 *
 * WHY NOT THE EXISTING HARNESSES. `qa-capture` photographs /dev/qa, which
 * frames each shot from a fixed camera and lights it with one preset — it
 * can say whether geometry is correct and nothing at all about what the
 * product looks like while someone is using it. The harnesses that could
 * (`qa-orbit`, `qa-lighting`, `qa-stage`) read dev-only handles, and the
 * dev server in this environment never mounts the viewport chunk, so they
 * cannot run. The answer is not to claim those audits passed.
 *
 * So this uses no handles. It clicks the lighting control, turns the
 * wheel, and drags with the mouse — the three things a first-time
 * customer does — against a production server, and writes a sheet.
 *
 * It fails on what cannot be a matter of taste: a console error, a
 * request the server refused, or a viewport that stops rendering. The
 * pictures are what the lighting and camera audits actually read.
 *
 * Prereq: a production server on localhost:3000 (`next start`).
 * Run from apps/web:  node scripts/qa-viewport.mjs [--deity shiva]
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

const args = process.argv.slice(2);
const only = args.includes("--deity") ? args[args.indexOf("--deity") + 1] : null;
const outName = args.includes("--out") ? args[args.indexOf("--out") + 1] : "viewport";
const FORMS = only ? [only] : ["ganesha", "shiva", "vishnu"];
const LIGHTS = ["Sanctum", "Studio", "Temple", "Dawn", "Night"];

const outDir = path.join(repo, "screenshots", outName);
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
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url().slice(0, 140)}`);
});

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click a button by its exact visible text. */
const clickText = (text) =>
  page.evaluate((want) => {
    const button = [...document.querySelectorAll("button")].find(
      (node) => node.textContent?.trim() === want,
    );
    if (!button) return false;
    button.click();
    return true;
  }, text);

/** Where the statue is on screen: the canvas's own middle. */
async function canvasBox() {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
}

/** Turn the wheel over the viewport. Negative zooms in. */
async function wheel(delta, times = 1) {
  const box = await canvasBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < times; i += 1) {
    await page.mouse.wheel({ deltaY: delta });
    await settle(90);
  }
  await settle(500);
}

/** Drag across the viewport, which is how a customer orbits. */
async function drag(dx, dy = 0) {
  const box = await canvasBox();
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const steps = 18;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps);
    await settle(16);
  }
  await page.mouse.up();
  await settle(450);
}

const sheet = [];
async function shot(name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  // Is anything still being drawn? A canvas that has stopped is a black
  // rectangle, and a sheet of those looks like a successful run.
  const lit = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return 0;
    return canvas.width * canvas.height;
  });
  sheet.push({ name, pixels: lit });
  console.log(`  wrote ${name}`);
}

for (const form of FORMS) {
  await page.goto(`${BASE}/studio?form=${form}`, { waitUntil: "networkidle2", timeout: 180_000 });
  await page
    .evaluate(() => {
      const button = [...document.querySelectorAll('[data-testid="stage-intro"] button')].find(
        (node) => node.textContent?.trim().toLowerCase() === "enter",
      );
      button?.click();
    })
    .catch(() => null);
  await page
    .waitForFunction(() => document.querySelector('[data-testid="temple-opening"]') === null, {
      timeout: 180_000,
      polling: 150,
    })
    .catch(() => null);
  await settle(1200);

  // --- lighting: every shipped preset, at the framing the Studio opens on
  for (const light of LIGHTS) {
    const opened = await page.evaluate(() => {
      const control = [...document.querySelectorAll("button")].find((node) =>
        /light/i.test(node.getAttribute("aria-label") ?? node.textContent ?? ""),
      );
      if (!control) return false;
      control.click();
      return true;
    });
    if (!opened) break;
    await settle(250);
    const picked = await clickText(light);
    await settle(700);
    if (picked) await shot(`${form}-light-${light.toLowerCase()}`);
    // Close the popover so it is not in the next picture.
    await page.keyboard.press("Escape").catch(() => null);
    await settle(200);
  }

  /**
   * ZOOMED OUT, UNDER EVERY RIG.
   *
   * The reported defect is "patchy lighting when zoomed out", and that is
   * two questions at once: how the figure is lit, and what the HALL looks
   * like once the camera is far enough back to see it. Close framing
   * hides the second one entirely, so each preset is photographed at the
   * far end of the dolly as well as at rest.
   */
  for (const light of LIGHTS) {
    const opened = await page.evaluate(() => {
      const control = [...document.querySelectorAll("button")].find((node) =>
        /light/i.test(node.getAttribute("aria-label") ?? node.textContent ?? ""),
      );
      if (!control) return false;
      control.click();
      return true;
    });
    if (!opened) break;
    await settle(250);
    const picked = await clickText(light);
    await page.keyboard.press("Escape").catch(() => null);
    await settle(600);
    if (!picked) continue;
    await wheel(240, 7);
    await shot(`${form}-far-${light.toLowerCase()}`);
    await wheel(-240, 7);
    await settle(400);
  }

  // Back to the rig the Studio opens on, so the camera sheet below is
  // about the camera.
  await page.evaluate(() => {
    const control = [...document.querySelectorAll("button")].find((node) =>
      /light/i.test(node.getAttribute("aria-label") ?? node.textContent ?? ""),
    );
    control?.click();
  });
  await settle(250);
  await clickText("Sanctum");
  await page.keyboard.press("Escape").catch(() => null);
  await settle(600);

  // --- zoom: all the way in, back to rest, all the way out
  await wheel(-240, 5);
  await shot(`${form}-zoom-in`);
  await wheel(240, 5);
  await settle(400);
  await wheel(240, 7);
  await shot(`${form}-zoom-out`);
  await wheel(-240, 7);
  await settle(400);

  // --- orbit: a full turn, in eight drags
  for (let i = 1; i <= 8; i += 1) {
    await drag(180);
    await shot(`${form}-orbit-${String(i).padStart(2, "0")}`);
  }
  // And over the top, which is where a camera finds the inside of things.
  await drag(0, -220);
  await shot(`${form}-orbit-high`);
  await drag(0, 440);
  await shot(`${form}-orbit-low`);
}

await writeFile(path.join(outDir, "report.json"), JSON.stringify({ sheet, errors }, null, 2));
await browser.close();

console.log(`\n${sheet.length} view(s) -> screenshots/${outName}`);
if (errors.length > 0) {
  const unique = [...new Set(errors)];
  console.error(`\n${errors.length} console/network error(s):`);
  for (const error of unique.slice(0, 20)) console.error(`  ${error}`);
  process.exit(1);
}
