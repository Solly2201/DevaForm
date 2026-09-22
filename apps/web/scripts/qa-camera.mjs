/**
 * Can the customer actually move the camera?
 *
 * Three separate motions, and a product that has two of them is a product
 * a customer cannot frame: orbit was there, dolly was there, and pan had
 * been switched off wherever the stage has a backdrop — so right-drag,
 * where every 3D tool puts pan, did nothing at all.
 *
 * This drives each motion with real mouse input and reads the camera
 * afterwards, because "the control is enabled" is not the same claim as
 * "the view moved".
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/qa-camera.mjs [--deity vishnu]
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
const deity = flag("deity", "vishnu");
const outDir = path.join(repo, "screenshots", flag("out", `camera-${deity}`));
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto(`${BASE}/studio?form=${deity}`, { waitUntil: "networkidle0", timeout: 120_000 });
await page
  .waitForSelector('[data-testid="stage-intro"]', { timeout: 20_000 })
  .then(async () => {
    await page.evaluate(() => {
      [...document.querySelectorAll('[data-testid="stage-intro"] button')]
        .find((n) => n.textContent?.trim().toLowerCase() === "enter")
        ?.click();
    });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="stage-intro"]') === null,
      { timeout: 90_000 },
    );
  })
  .catch(() => null);
await new Promise((r) => setTimeout(r, 1800));

/** Where the camera is and what it is looking at, from the rig's own scene. */
const camera = () => page.evaluate(() => window.__devaformCamera?.() ?? null);

const middleOfCanvas = async () => {
  const box = await page.evaluate(() => {
    const r = document.querySelector("canvas").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  return box;
};

const drag = async (button, dx, dy) => {
  const at = await middleOfCanvas();
  await page.mouse.move(at.x, at.y);
  await page.mouse.down({ button });
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(at.x + (dx * i) / 8, at.y + (dy * i) / 8);
    await new Promise((r) => setTimeout(r, 18));
  }
  await page.mouse.up({ button });
  await new Promise((r) => setTimeout(r, 320));
};

const report = { deity };
const moved = (a, b) =>
  Boolean(a && b && a.position.some((v, i) => Math.abs(v - b.position[i]) > 1e-3));
const targetMoved = (a, b) =>
  Boolean(a?.target && b?.target && a.target.some((v, i) => Math.abs(v - b.target[i]) > 1e-3));

report.start = await camera();

// Orbit: left drag turns the figure and leaves the target alone.
let before = await camera();
await drag("left", 180, 0);
let after = await camera();
report.orbit = { moved: moved(before, after), targetMoved: targetMoved(before, after) };
await writeFile(path.join(outDir, "1-orbit.png"), await page.screenshot({ type: "png" }));

// Pan: right drag moves the framing — the TARGET has to move, or the
// customer has only turned the statue again.
before = await camera();
await drag("right", 0, -140);
after = await camera();
report.pan = { moved: moved(before, after), targetMoved: targetMoved(before, after) };
await writeFile(path.join(outDir, "2-pan.png"), await page.screenshot({ type: "png" }));

// Middle drag: dolly.
before = await camera();
await drag("middle", 0, 90);
after = await camera();
report.middleDrag = { moved: moved(before, after) };

// Wheel: zoom.
before = await camera();
const at = await middleOfCanvas();
await page.mouse.move(at.x, at.y);
for (let i = 0; i < 4; i += 1) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise((r) => setTimeout(r, 60));
}
await new Promise((r) => setTimeout(r, 320));
after = await camera();
report.wheel = { moved: moved(before, after) };
await writeFile(path.join(outDir, "3-zoom.png"), await page.screenshot({ type: "png" }));

// The bound: pan hard and check the framing stayed on the stage.
for (let i = 0; i < 6; i += 1) await drag("right", 300, 300);
report.bounded = await camera();

// Reset: one control that undoes all three.
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((n) => n.textContent?.trim() === "Reset")
    ?.click();
});
await new Promise((r) => setTimeout(r, 500));
report.afterReset = await camera();
// Twice, to tell a one-shot residual from a standing offset.
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((n) => n.textContent?.trim() === "Reset")
    ?.click();
});
await new Promise((r) => setTimeout(r, 500));
report.afterSecondReset = await camera();
// Against the stage's own composition, not against a sample that may have
// been taken while the entry was still easing into it.
const hero = await page.evaluate(
  () => window.__devaformStage?.() ?? null,
);
report.hero = hero;
const near = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 0.01);
report.resetRestored = Boolean(
  hero &&
    near(report.afterReset?.position, hero.position) &&
    near(report.afterReset?.target, hero.target),
);
await writeFile(path.join(outDir, "4-reset.png"), await page.screenshot({ type: "png" }));

// The context menu must not appear over the canvas: right-drag is pan.
report.contextMenuPrevented = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  canvas.dispatchEvent(event);
  return event.defaultPrevented;
});

report.consoleErrors = consoleErrors;
await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
