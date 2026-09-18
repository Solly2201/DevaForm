/**
 * The entry sequence, as frames the customer can scrub.
 *
 * The entry is no longer something that plays at a customer; they scroll
 * INTO the temple, and their scroll position is the sequence's position.
 * A video element cannot be driven that way with any grace — seeking a
 * shipped MP4 costs 34 ms at the median and 59 ms at the ninetieth
 * percentile on this machine, which is a scrub that steps rather than
 * moves, however smoothly the input is filtered.
 *
 * So the footage is decoded ONCE, here, into an evenly spaced strip of
 * stills. At runtime the entry cross-dissolves between the two frames
 * bracketing the scroll position, which is two composited draws and is
 * continuous however few frames there are — the strip is a sampling of
 * the motion, not a flip-book of it.
 *
 * The LAST frame is deliberately not written: the strip ends on the
 * backdrop still the interactive stage already stands on, so the handover
 * out of the entry is the same file giving way to itself. That continuity
 * is the whole reason the presentation layer exists.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/build-intro-frames.mjs [intro-id]
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
const INTROS = path.join(here, "../public/assets/presentation/intros");
const [, , only] = process.argv;

/**
 * How many stills the sequence is sampled into.
 *
 * Enough that the cross-dissolve between neighbours is a blend of two
 * nearly identical pictures rather than a blur of two different ones, and
 * few enough that the strip costs about what the video did. At six
 * seconds this is roughly seven samples a second.
 */
const FRAMES = 40;
const QUALITY = 0.78;

/** Every intro on disk, from its own record. */
async function introRecords() {
  const found = [];
  for (const name of await readdir(INTROS)) {
    for (const version of await readdir(path.join(INTROS, name))) {
      const dir = path.join(INTROS, name, version);
      const record = JSON.parse(await readFile(path.join(dir, "asset.json"), "utf8"));
      found.push({ dir, record });
    }
  }
  return found;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(BASE, { waitUntil: "domcontentloaded" });

for (const { dir, record } of await introRecords()) {
  if (only && record.id !== only) continue;
  const { startsAt, lastFrameAt } = record.timing;
  const frames = await page.evaluate(
    async (src, from, to, count, quality) => {
      const video = document.createElement("video");
      video.src = src;
      video.muted = true;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error(`cannot decode ${src}`));
      });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      const out = [];
      // One fewer than the strip's length: the last sample is the
      // backdrop still, which already exists.
      for (let i = 0; i < count - 1; i += 1) {
        video.currentTime = from + ((to - from) * i) / (count - 1);
        await new Promise((resolve) => {
          video.onseeked = resolve;
        });
        context.drawImage(video, 0, 0);
        out.push(canvas.toDataURL("image/jpeg", quality));
      }
      return { width: canvas.width, height: canvas.height, jpegs: out };
    },
    `${BASE}${record.media.video}`,
    startsAt,
    lastFrameAt,
    FRAMES,
    QUALITY,
  );

  const outDir = path.join(dir, "frames");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  let bytes = 0;
  for (const [index, jpeg] of frames.jpegs.entries()) {
    const data = Buffer.from(jpeg.split(",")[1], "base64");
    bytes += data.length;
    await writeFile(path.join(outDir, `${String(index).padStart(3, "0")}.jpg`), data);
  }
  console.log(
    `${record.id}@${record.version}: ${frames.jpegs.length} frames + backdrop, ` +
      `${frames.width}x${frames.height}, ${(bytes / 1e6).toFixed(2)} MB`,
  );
  console.log(`  wrote ${outDir}`);
}

await browser.close();
