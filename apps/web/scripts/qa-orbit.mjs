/**
 * A full turn round the statue.
 *
 * The question is not whether the camera moves — it is whether the
 * statue stays planted and the room stays behind it while it does. That
 * cannot be answered by one screenshot or by reading the code; it is a
 * sweep, and what it shows is either a figure standing on a stage or a
 * figure sliding across a photograph.
 *
 * Also measures the thing a picture cannot: where the character's root
 * and its lowest point actually are at each angle. They must not move.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/qa-orbit.mjs [--deity vishnu] [--steps 8]
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
const steps = Number(flag("steps", 8));
const outDir = path.join(repo, "screenshots", flag("out", `orbit-${deity}`));
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1000, height: 760 },
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
await new Promise((r) => setTimeout(r, 2200));

/** Where the statue actually is: its root, and the lowest point of its body. */
const plant = () =>
  page.evaluate(() => {
    const rig = window.__devaformRig;
    if (!rig) return null;
    rig.root.updateWorldMatrix(true, true);
    const round = (n) => Number(n.toFixed(5));
    const root = rig.joints.get("root");
    const V = () => rig.root.position.clone();
    let lowest = Infinity;
    for (const mesh of rig.bodyMeshes ?? []) {
      const position = mesh.geometry.getAttribute("position");
      if (!position) continue;
      mesh.updateWorldMatrix(true, false);
      for (let i = 0; i < position.count; i += 11) {
        const point = V().fromBufferAttribute(position, i);
        if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, point);
        point.applyMatrix4(mesh.matrixWorld);
        if (point.y < lowest) lowest = point.y;
      }
    }
    const world = root ? root.getWorldPosition(V()) : null;
    return {
      root: world ? [round(world.x), round(world.y), round(world.z)] : null,
      lowest: Number.isFinite(lowest) ? round(lowest) : null,
      statueRoot: [round(rig.root.position.x), round(rig.root.position.y), round(rig.root.position.z)],
    };
  });

/** Put the camera at an azimuth, keeping the stage's own distance and height. */
const orbitTo = (degrees) =>
  page.evaluate((deg) => {
    const stage = window.__devaformStage?.();
    const read = window.__devaformCamera?.();
    if (!stage || !read) return false;
    const [tx, ty, tz] = stage.target;
    const radius = Math.hypot(read.position[0] - tx, read.position[2] - tz);
    const angle = (deg * Math.PI) / 180;
    window.__devaformSetCamera?.([
      tx + Math.sin(angle) * radius,
      read.position[1],
      tz + Math.cos(angle) * radius,
    ]);
    return true;
  }, degrees);

const report = { deity, angles: [], consoleErrors };
for (let i = 0; i < steps; i += 1) {
  const degrees = Math.round((360 * i) / steps);
  const moved = await orbitTo(degrees);
  await new Promise((r) => setTimeout(r, 420));
  const at = await plant();
  report.angles.push({ degrees, moved, ...at });
  await writeFile(
    path.join(outDir, `${String(degrees).padStart(3, "0")}.png`),
    await page.screenshot({ type: "png" }),
  );
}

// The invariant, stated numerically: nothing about the statue moved.
const first = report.angles[0];
report.plantedThroughout = report.angles.every(
  (a) =>
    JSON.stringify(a.root) === JSON.stringify(first.root) &&
    Math.abs((a.lowest ?? 0) - (first.lowest ?? 0)) < 1e-4,
);
await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ plantedThroughout: report.plantedThroughout, angles: report.angles, consoleErrors }, null, 1));
await browser.close();
