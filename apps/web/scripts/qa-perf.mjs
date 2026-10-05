/**
 * What the Studio costs to start, and what a deity change costs after it.
 *
 * TWO KINDS OF NUMBER, and they are not interchangeable. Shader PROGRAMS,
 * geometries, textures and draw calls are properties of the scene: the
 * same on any machine, so they can be compared and held to. Wall-clock
 * milliseconds here are measured through SwiftShader, which rasterises on
 * the CPU — they say something about how much WORK is being asked for and
 * nothing reliable about what a customer's GPU will take. Every timing
 * this prints is labelled, and nothing should be optimised on one alone.
 *
 * The question it exists to answer: does changing deity compile new
 * shaders? `ZoneMaterials` is built once and kept, but its mapped and
 * patterned variants are created on demand — so the first figure to need
 * a hide's rosettes pays for them, and that is a hitch at the moment a
 * customer clicks.
 *
 * Prereq: `pnpm dev` running, Chrome installed.
 * Run from apps/web:  node scripts/qa-perf.mjs
 */
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1200, height: 900 },
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("PAGEERROR", String(error).slice(0, 200)));

/** Everything the renderer currently holds, and what it drew last frame. */
const cost = () =>
  page.evaluate(() => {
    const handle = window.__devaformRenderer;
    if (!handle) return null;
    const { gl, scene, camera } = handle();
    gl.render(scene, camera);
    return {
      programs: gl.info.programs?.length ?? 0,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    };
  });

const enter = async () => {
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
};

const report = { cold: {}, switches: [] };

// A warm-up navigation first: the first visit of a run pays for the dev
// server's compile and the cold GLB, which is not a product cost.
await page.goto(`${BASE}/studio?form=ganesha`, { waitUntil: "networkidle0", timeout: 180_000 });
await enter();
await page.waitForFunction(() => window.__devaformRenderer !== undefined, { timeout: 120_000 });
await new Promise((r) => setTimeout(r, 2500));

for (const deity of ["ganesha", "shiva", "vishnu"]) {
  const started = Date.now();
  await page.goto(`${BASE}/studio?form=${deity}`, { waitUntil: "networkidle0", timeout: 180_000 });
  await enter();
  await page.waitForFunction(() => window.__devaformRenderer !== undefined, { timeout: 120_000 });
  const ready = Date.now() - started;
  await new Promise((r) => setTimeout(r, 2500));
  report.cold[deity] = { ...(await cost()), swiftshaderMs: ready };
}

// Now the thing a customer actually does: change deity without reloading.
await page.goto(`${BASE}/studio?form=ganesha`, { waitUntil: "networkidle0", timeout: 180_000 });
await enter();
await page.waitForFunction(() => window.__devaformRenderer !== undefined, { timeout: 120_000 });
await new Promise((r) => setTimeout(r, 2500));
let before = await cost();
report.switches.push({ at: "ganesha (arrived)", ...before });

for (const deity of ["Shiva", "Vishnu", "Ganesha", "Shiva"]) {
  const clicked = await page.evaluate((name) => {
    // The cards read "ShivaThe Auspicious One" -- name then epithet, with
    // no separator in textContent. Match the start, not the whole.
    const open = [...document.querySelectorAll("button, [role='button']")].find((n) =>
      /divine\s*form/i.test(n.textContent ?? ""),
    );
    open?.click();
    const nodes = [...document.querySelectorAll("button, [role='button'], li, div")];
    const hit = nodes.find(
      (n) => n.textContent?.trim().startsWith(name) && n.offsetParent !== null,
    );
    if (!hit) return false;
    hit.click();
    return true;
  }, deity);
  if (!clicked) {
    report.switches.push({ at: deity, note: "no control found" });
    continue;
  }
  const started = Date.now();
  await new Promise((r) => setTimeout(r, 3500));
  const after = await cost();
  report.switches.push({
    at: deity,
    ...after,
    newPrograms: after && before ? after.programs - before.programs : null,
    swiftshaderMs: Date.now() - started,
  });
  before = after;
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
