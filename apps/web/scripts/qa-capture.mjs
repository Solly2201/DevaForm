/**
 * Visual QA capture.
 *
 * Renders a SHEET of views — every camera for every configuration named in
 * a plan — through the real runtime renderer, and writes them to
 * screenshots/<run>/. The point is that a QA pass is one command producing
 * a complete, comparable set, rather than a sequence of manual screenshots
 * that each answer half a question.
 *
 * It also captures the rig's own warnings per view, so a render that looks
 * fine while the engine is complaining cannot pass quietly.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run:    node scripts/qa-capture.mjs <plan> [--out name]
 *
 * Plans live in scripts/qa-plans.json.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";

const [planName, ...rest] = process.argv.slice(2);
if (!planName) {
  console.error("usage: node scripts/qa-capture.mjs <plan> [--out name]");
  process.exit(2);
}
const outFlag = rest.indexOf("--out");
const runName = outFlag >= 0 ? rest[outFlag + 1] : planName;

const plans = JSON.parse(await readFile(path.join(here, "qa-plans.json"), "utf8"));
const plan = plans[planName];
if (!plan) {
  console.error(`unknown plan "${planName}". known: ${Object.keys(plans).join(", ")}`);
  process.exit(2);
}

const outDir = path.join(repo, "screenshots", runName);
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  // SwiftShader, deliberately: a software rasteriser renders the same
  // pixels on every machine, and a QA sheet that differs by GPU cannot be
  // compared with the last one. --no-sandbox is what lets a GL context
  // exist at all in this environment.
  args: [
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
  ],
  defaultViewport: { width: plan.width ?? 900, height: plan.height ?? 1200 },
});
const page = await browser.newPage();

const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

const report = [];
let failures = 0;

// Warm the route before the first shot counts.
//
// The first navigation of a run pays for the dev server compiling
// /dev/qa and for the body GLB arriving cold, and a sheet whose first
// view is a costume with nobody in it has been published twice. This
// render is thrown away; every shot after it is measured against a
// server that has already done that work.
await page.goto(`${BASE}/dev/qa?${new URLSearchParams(plan.shots[0]?.params ?? {})}`, {
  waitUntil: "networkidle0",
  timeout: 180_000,
});
await page.waitForFunction(() => window.__devaformQa, { timeout: 120_000 }).catch(() => null);

for (const shot of plan.shots) {
  const query = new URLSearchParams(shot.params ?? {});
  for (const view of shot.views ?? ["front"]) {
    query.set("view", view);
    const url = `${BASE}/dev/qa?${query.toString()}`;
    await page.goto(url, { waitUntil: "networkidle0", timeout: 120_000 });
    const result = await page
      .waitForFunction(() => window.__devaformQa, { timeout: 90_000 })
      .then(async (handle) => ({
        image: await handle.jsonValue(),
        warnings: await page.evaluate(() => window.__devaformQaWarnings ?? []),
        frame: await page.evaluate(() => window.__devaformQaFrame ?? null),
      }))
      .catch(() => null);
    const name = `${shot.name}-${view}${shot.params?.focus ? `-${shot.params.focus}` : ""}.png`;
    if (!result || result.image === "FAILED") {
      console.error(`  FAILED  ${name}`);
      failures += 1;
      continue;
    }
    await writeFile(
      path.join(outDir, name),
      Buffer.from(result.image.split(",")[1], "base64"),
    );
    report.push({ name, url, frame: result.frame, warnings: result.warnings });
    const flag = result.warnings.length ? ` ⚠ ${result.warnings.length}` : "";
    console.log(`  wrote   ${name}${flag}`);
    for (const warning of result.warnings) console.log(`            ${warning}`);
  }
}

await writeFile(
  path.join(outDir, "report.json"),
  JSON.stringify({ plan: planName, consoleErrors, shots: report }, null, 2),
);
if (consoleErrors.length > 0) {
  console.error(`\n${consoleErrors.length} console error(s):`);
  for (const error of consoleErrors.slice(0, 20)) console.error(`  ${error}`);
}
console.log(`\n${report.length} view(s) -> screenshots/${runName}`);

await browser.close();
process.exit(failures > 0 || consoleErrors.length > 0 ? 1 : 0);
