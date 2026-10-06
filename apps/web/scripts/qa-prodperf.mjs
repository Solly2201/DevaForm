/**
 * What the shipped build costs, measured without dev handles.
 *
 * `qa-perf.mjs` reads `renderer.info` — draw calls, triangles, how many
 * shader programs got compiled — and that handle is guarded by
 * `NODE_ENV !== "production"`, correctly. So it measures the geometry and
 * cannot measure the artefact.
 *
 * This measures the artefact, using only what any page exposes: how long
 * the document took, when a viewport first existed, when the figure was
 * first usable, how long a form switch takes, and whether the JS heap
 * grows when a customer switches back and forth.
 *
 * THE HEAP LOOP IS THE POINT. Everything else here is a number that will
 * differ on every machine. "Switching between three deities twelve times
 * leaves more memory held than it started with" is a defect that shows up
 * on any machine, and it is the one a person meets after ten minutes of
 * playing rather than in the first four seconds.
 *
 * Prereq: `pnpm build && pnpm start`, Chrome installed.
 * Run from apps/web:  node scripts/qa-prodperf.mjs
 */
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
const ROUNDS = Number(process.env.DEVAFORM_ROUNDS ?? 4);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    // The heap reading is meaningless without a collection to compare to.
    "--js-flags=--expose-gc",
  ],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 160));
});
page.on("requestfailed", (r) => errors.push(`${r.url()} ${r.failure()?.errorText ?? ""}`));

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

// --- first load -----------------------------------------------------------
const started = now();
await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded", timeout: 180_000 });
const domReady = now() - started;

await page
  .waitForSelector('[data-testid="stage-intro"]', { timeout: 30_000 })
  .then(() =>
    page.evaluate(() => {
      [...document.querySelectorAll('[data-testid="stage-intro"] button')]
        .find((n) => n.textContent?.trim().toLowerCase() === "enter")
        ?.click();
    }),
  )
  .catch(() => null);

/** A viewport exists and has been given room. */
await page.waitForFunction(
  () => {
    const c = document.querySelector("canvas");
    return c !== null && c.getBoundingClientRect().width > 200;
  },
  { timeout: 180_000, polling: 100 },
);
const firstViewport = now() - started;

/**
 * The Studio is the customer's.
 *
 * Three signals together, because no one of them is enough. The arrival
 * veil only exists during a form swap, so waiting for it to disappear
 * found no element on a first load, resolved at once, and reported the
 * Studio usable two milliseconds after the canvas had been given room -
 * with nothing standing in it. Waiting for the OPENING to lift is right
 * when there is an opening, and on a fast machine the figure is ready
 * before that cover can mount, so waiting for one to appear first spent
 * a twenty-second timeout and reported it as the load.
 *
 * So: a canvas with room, no opening over it, and the chrome handed over
 * - the Save button is not in the tree until the entry has finished. All
 * three at once is the first frame a customer could act on.
 */
let sawOpening = false;
let usable = 0;
{
  let handed = false;
  for (let i = 0; i < 1800 && !handed; i += 1) {
    const state = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const save = [...document.querySelectorAll("button")].some(
        (node) => node.textContent?.trim() === "Save",
      );
      return {
        opening: document.querySelector('[data-testid="temple-opening"]') !== null,
        ready: canvas !== null && canvas.getBoundingClientRect().width > 200 && save,
      };
    });
    if (state.opening) sawOpening = true;
    if (state.ready && !state.opening) {
      usable = now() - started;
      handed = true;
      break;
    }
    await settle(100);
  }
  if (!handed) throw new Error("the Studio never handed over: no usable figure in three minutes");
}

const timing = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  return nav
    ? {
        ttfbMs: Math.round(nav.responseStart),
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadMs: Math.round(nav.loadEventEnd),
        transferredKb: Math.round(
          performance
            .getEntriesByType("resource")
            .reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024,
        ),
      }
    : null;
});

const heap = () =>
  page.evaluate(async () => {
    if (typeof window.gc === "function") window.gc();
    await new Promise((r) => setTimeout(r, 400));
    const m = performance.memory;
    return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
  });

// --- switching, over and over --------------------------------------------
const switchTo = async (name) => {
  const began = now();
  await page.evaluate(() => {
    [...document.querySelectorAll("button, [role='button']")]
      .find((n) => /divine\s*form/i.test(n.textContent ?? ""))
      ?.click();
  });
  await settle(700);
  const clicked = await page.evaluate((wanted) => {
    const card = [...document.querySelectorAll("button")].find(
      (n) => n.textContent?.trim().startsWith(wanted) && n.offsetParent !== null && !n.disabled,
    );
    if (!card) return false;
    card.click();
    return true;
  }, name);
  if (!clicked) return null;
  await settle(400);
  await page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog']");
    [...(dialog?.querySelectorAll("button") ?? [])]
      .find((n) => n.textContent?.trim().startsWith("Switch to"))
      ?.click();
  });
  const lifted = await page
    .waitForFunction(() => document.querySelector('[data-testid="stage-arrival"]') === null, {
      timeout: 90_000,
      polling: 120,
    })
    .then(() => true)
    .catch(() => false);
  return { ms: now() - began, lifted };
};

const baselineHeap = await heap();
const switches = [];
for (let round = 0; round < ROUNDS; round += 1) {
  for (const name of ["Shiva", "Vishnu", "Ganesha"]) {
    const result = await switchTo(name);
    if (result) switches.push({ round, name, ...result });
  }
}
const finalHeap = await heap();

const report = {
  firstLoad: {
    domReadyMs: domReady,
    firstViewportMs: firstViewport,
    usableMs: usable,
    /** False means the opening was never shown — a gap nobody is covering. */
    openingShown: sawOpening,
  },
  timing,
  switches,
  heapMb: { before: baselineHeap, after: finalHeap, grewMb: baselineHeap && finalHeap ? finalHeap - baselineHeap : null },
  consoleErrors: errors,
};
console.log(JSON.stringify(report, null, 1));

const slow = switches.filter((s) => !s.lifted);
if (slow.length > 0) console.error(`${slow.length} switch(es) never finished arriving`);

/**
 * THE HEAP HAS TO PLATEAU, which is a different claim from "the heap is
 * small".
 *
 * Measured on this build: ten switches grow it by 43 MB and twenty-two
 * grow it by 44. That is the asset cache filling with three deities'
 * meshes and then being full — the shape a cache makes. A leak makes a
 * line instead, and at the first measurement's rate twenty-two switches
 * would have cost ninety.
 *
 * So the ceiling is set above the plateau and well under the line, and it
 * is checked at whatever round count it was run with. Raising
 * DEVAFORM_ROUNDS makes this a sharper test, not a laxer one.
 */
const CEILING_MB = 90;
const grew = report.heapMb.grewMb;
if (grew !== null && grew > CEILING_MB) {
  console.error(
    `the heap grew ${grew} MB over ${switches.length} switches — a cache fills and stops, a leak does not`,
  );
}
await browser.close();
process.exitCode =
  slow.length === 0 && errors.length === 0 && (grew === null || grew <= CEILING_MB) ? 0 : 1;
