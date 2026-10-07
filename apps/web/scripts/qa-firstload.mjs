/**
 * WHERE THE FIRST TWENTY SECONDS GO.
 *
 * `qa-prodperf` reports one number for the first usable Studio, and on
 * this machine it is nineteen and a half seconds. That number on its own
 * is unactionable and close to meaningless: these runs are headless with
 * SwiftShader, so every triangle is rasterised on the CPU and the figure
 * is several hundred thousand of them. Compressing an asset because a
 * software rasteriser is slow would be fixing the harness.
 *
 * So this splits the wall clock into the parts that have different
 * causes and different cures:
 *
 *   - the DOCUMENT, and the chunks the Studio needs before it can mount;
 *   - the NETWORK cost of the assets, which is the same on every machine
 *     and is the only part a smaller GLB would change;
 *   - the time between the last byte arriving and a canvas existing,
 *     which is rig construction — CPU, and real on a customer's machine
 *     too, though faster;
 *   - the time between a canvas existing and a frame being drawn in it,
 *     which is context creation and shader compilation, and is where a
 *     software rasteriser spends its day.
 *
 * It asserts nothing. It is a baseline, printed so that an experiment
 * afterwards has something to be compared against.
 *
 * Prereq: `pnpm build && pnpm start`, Chrome installed.
 * Run from apps/web:  node scripts/qa-firstload.mjs
 */
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
/** Which form the Studio opens on — the three cost different things. */
const FORM = process.argv.includes("--form")
  ? process.argv[process.argv.indexOf("--form") + 1]
  : null;
const STUDIO = FORM ? `${BASE}/studio?form=${FORM}` : `${BASE}/studio`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 160));
});

/** Every model request the browser actually issues, timed. */
const fetched = [];
page.on("request", (request) => {
  if (/\.(glb|gltf)(\?|$)/i.test(request.url())) {
    const frames = request.initiator?.()?.stack?.callFrames ?? [];
    fetched.push({
      at: Date.now() - started,
      url: request.url(),
      from: frames.map((f) => (f.url ?? "").split("/").pop()).filter(Boolean).slice(0, 4).join(" <- "),
    });
  }
});

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const marks = {};
const started = Date.now();
const mark = (name) => {
  marks[name] = Date.now() - started;
};

await page.goto(STUDIO, { waitUntil: "domcontentloaded", timeout: 180_000 });
mark("documentReady");

await page
  .waitForSelector('[data-testid="stage-intro"]', { timeout: 60_000 })
  .then(() => mark("entryOffered"))
  .catch(() => null);
await page.evaluate(() => {
  [...document.querySelectorAll('[data-testid="stage-intro"] button')]
    .find((node) => node.textContent?.trim().toLowerCase() === "enter")
    ?.click();
});
mark("entered");

await page.waitForFunction(() => document.querySelector("canvas") !== null, {
  timeout: 180_000,
  polling: 50,
});
mark("canvasExists");

/**
 * A DRAWN FRAME, NOT A CANVAS.
 *
 * An empty canvas is one pixel value repeated; a lit sanctum is not. So
 * the first frame is the first moment the canvas has more than a couple
 * of distinct values in it, which costs one readback per poll and is the
 * only question here a screenshot could answer.
 */
await page
  .waitForFunction(
    () => {
      const canvas = document.querySelector("canvas");
      if (!canvas || canvas.width < 2) return false;
      const probe = document.createElement("canvas");
      probe.width = 24;
      probe.height = 24;
      const context = probe.getContext("2d");
      if (!context) return false;
      try {
        context.drawImage(canvas, 0, 0, 24, 24);
        const data = context.getImageData(0, 0, 24, 24).data;
        const seen = new Set();
        for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        return seen.size > 3;
      } catch {
        return false;
      }
    },
    { timeout: 180_000, polling: 150 },
  )
  .catch(() => null);
mark("firstFrame");

await page
  .waitForFunction(
    () =>
      document.querySelector('[data-testid="temple-opening"]') === null &&
      [...document.querySelectorAll("button")].some((node) => node.textContent?.trim() === "Save"),
    { timeout: 180_000, polling: 100 },
  )
  .catch(() => null);
mark("usable");
await settle(1500);

const resources = await page.evaluate(() =>
  performance.getEntriesByType("resource").map((entry) => ({
    name: entry.name.replace(location.origin, ""),
    kb: Math.round((entry.transferSize || entry.encodedBodySize || 0) / 1024),
    startMs: Math.round(entry.startTime),
    endMs: Math.round(entry.responseEnd),
  })),
);

const biggest = [...resources].sort((a, b) => b.kb - a.kb).slice(0, 8);
const lastByte = resources.reduce((worst, entry) => Math.max(worst, entry.endMs), 0);
const totalKb = resources.reduce((sum, entry) => sum + entry.kb, 0);
const models = resources.filter((entry) => /\.(glb|gltf|bin)$/i.test(entry.name));

console.log("\n=== what the first load is made of ===");
console.log(`  document ready            ${marks.documentReady} ms`);
console.log(`  entry offered             ${marks.entryOffered ?? "-"} ms`);
console.log(`  Enter pressed             ${marks.entered} ms`);
console.log(`  last byte of any asset    ${Math.round(lastByte)} ms (from navigation start)`);
console.log(`  a canvas exists           ${marks.canvasExists} ms`);
console.log(`  something is drawn in it  ${marks.firstFrame} ms`);
console.log(`  usable Studio             ${marks.usable} ms`);
console.log("\n  --- the gaps, and what each one is ---");
console.log(`  network, to the last byte          ${Math.round(lastByte)} ms`);
console.log(
  `  last byte -> a canvas              ${Math.max(0, marks.canvasExists - Math.round(lastByte))} ms  (rig construction, CPU)`,
);
console.log(
  `  a canvas -> a drawn frame          ${Math.max(0, marks.firstFrame - marks.canvasExists)} ms  (GL context + shaders; SwiftShader here)`,
);
console.log(
  `  a drawn frame -> usable            ${Math.max(0, marks.usable - marks.firstFrame)} ms  (the opening lifting)`,
);

console.log(`\n=== transferred: ${totalKb} kB over ${resources.length} requests ===`);
for (const entry of biggest) {
  console.log(`  ${String(entry.kb).padStart(5)} kB  ${entry.endMs - entry.startMs} ms  ${entry.name.slice(0, 70)}`);
}
console.log(`\n  models: ${models.length} file(s), ${models.reduce((s, m) => s + m.kb, 0)} kB`);
for (const model of models) console.log(`    ${model.kb} kB  ${model.name}`);
console.log(`\n  model requests actually made: ${fetched.length}`);
for (const one of fetched) console.log(`    +${one.at} ms  ${one.url.split("/assets/")[1] ?? one.url}
        from ${one.from}`);
console.log(`\n  console errors: ${errors.length}`);
for (const error of [...new Set(errors)].slice(0, 8)) console.log(`    ${error}`);

await browser.close();
