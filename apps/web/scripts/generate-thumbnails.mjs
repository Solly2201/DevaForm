/**
 * Deterministic thumbnail generation for GLB dataset assets.
 *
 * Uses the running dev server's internal capture route
 * (/dev/thumbnail/[assetId]) so thumbnails come from the exact runtime
 * renderer — standard studio lighting, framed camera, default palette —
 * and saves them into each asset's dataset directory.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run:    node scripts/generate-thumbnails.mjs [assetId…]
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { readManifestEntries, repoPaths } from "./lib/manifest.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { manifestDir, publicDir } = repoPaths(here);
const only = process.argv.slice(2);

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";

const entries = (await readManifestEntries(manifestDir)).filter(
  (e) => e.glbPath && e.thumbnail && (only.length === 0 || only.includes(e.id)),
);
if (entries.length === 0) {
  console.log("No GLB assets with thumbnail paths found.");
  process.exit(0);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  defaultViewport: { width: 480, height: 480 },
});
const page = await browser.newPage();

let failures = 0;
for (const entry of entries) {
  const url = `${BASE}/dev/thumbnail/${encodeURIComponent(entry.id)}`;
  await page.goto(url, { waitUntil: "networkidle2", timeout: 120_000 });
  const dataUrl = await page
    .waitForFunction(() => window.__devaformThumb, { timeout: 60_000 })
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  if (!dataUrl || dataUrl === "FAILED") {
    console.error(`  FAILED  ${entry.id}`);
    failures += 1;
    continue;
  }
  const file = path.join(publicDir, entry.thumbnail.replace(/^\//, ""));
  await writeFile(file, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`  wrote   ${entry.thumbnail}`);
}

await browser.close();
process.exit(failures > 0 ? 1 : 0);
