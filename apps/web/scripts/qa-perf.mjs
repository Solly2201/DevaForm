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
  /**
   * OPEN THE PANEL, THEN LET IT RENDER, THEN FIND THE CARD.
   *
   * These were one `page.evaluate`: click Divine Form and search for the
   * deity's card in the same synchronous pass. React has not re-rendered
   * by then, so the card does not exist yet and the FIRST switch always
   * reported "no control found" -- which is why every run of this script
   * had a hole where Shiva's numbers should be. The ones after it worked
   * only because the panel was left open by the attempt that failed.
   */
  await page.evaluate(() => {
    const open = [...document.querySelectorAll("button, [role='button']")].find((n) =>
      /divine\s*form/i.test(n.textContent ?? ""),
    );
    open?.click();
  });
  await new Promise((r) => setTimeout(r, 900));

  const clicked = await page.evaluate((name) => {
    // The cards read "ShivaThe Auspicious One" -- name then epithet, with
    // no separator in textContent. Match the start, not the whole.
    //
    // Buttons only. A wrapping div also starts with the name, matches
    // first, and swallows the click -- which is how four switches in a
    // row reported identical scene counts.
    const nodes = [...document.querySelectorAll("button, [role='button']")];
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
  /**
   * And the unsaved-changes confirmation, which is correct product
   * behaviour and which a harness has to answer rather than route round.
   * Switching form starts a new creation; if the current one has
   * unsaved edits, the product says so and waits.
   */
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog']");
    if (!dialog) return;
    [...dialog.querySelectorAll("button")]
      .find((n) => n.textContent?.trim().startsWith("Switch to"))
      ?.click();
  });
  const started = Date.now();
  // Wait for the FIGURE to change, not for a timer. The header chip is
  // the product's own statement of which deity is loaded.
  /**
   * ARRIVED MEANS THE COVER HAS LIFTED, not that a word is on screen.
   *
   * Every card in the Divine Form panel contains a leaf node reading the
   * deity's name, so "a chip with this text exists" was already true
   * before the switch and this measured nothing. The stage raises a cover
   * before the configuration changes and drops it when the new figure is
   * standing, which is exactly the event worth timing -- and timing it
   * from the click is how long a customer waits.
   */
  const arrived = await page
    .waitForFunction(
      () => document.querySelector('[data-testid="stage-arrival"]') === null,
      { timeout: 60_000, polling: 200 },
    )
    .then(() => true)
    .catch(() => false);
  const waitedMs = Date.now() - started;
  await new Promise((r) => setTimeout(r, 1500));
  const after = await cost();
  report.switches.push({
    at: deity,
    ...after,
    arrived,
    waitedMs,
    newPrograms: after && before ? after.programs - before.programs : null,
    swiftshaderMs: Date.now() - started,
  });
  before = after;
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
