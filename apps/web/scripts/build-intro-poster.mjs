/**
 * The intro's last frame, as a still.
 *
 * The presentation stage's backdrop IS the final frame of the entry
 * sequence — that is the whole continuity requirement: the video ends,
 * the still takes over, and nothing on screen changes. Two files holding
 * the same picture is only safe if one is DERIVED from the other, so this
 * derives it. Chrome decodes the video, walks back from the end until the
 * picture changes to find the frame the encoder actually last wrote, and
 * writes that frame out beside the video.
 *
 * Re-run it whenever an intro video changes; a test holds the shipped
 * still to the frame this produces, so a video swapped without re-running
 * it fails the build rather than showing a seam nobody notices until a
 * customer does.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/build-intro-poster.mjs [intro-id]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
const INTROS = path.join(here, "../public/assets/presentation/intros");
const [, , only] = process.argv;

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
  const result = await page.evaluate(async (src) => {
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

    const draw = async (time) => {
      video.currentTime = time;
      await new Promise((resolve) => {
        video.onseeked = resolve;
      });
      context.drawImage(video, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    // Seeking past the last written frame returns that frame again, so
    // walking back until the picture changes finds where it really stops.
    const end = video.duration - 0.02;
    const last = await draw(end);
    let held = end;
    for (let back = 0.04; back < 0.6; back += 0.02) {
      const earlier = await draw(end - back);
      let different = 0;
      for (let i = 0; i < last.length; i += 40) {
        if (Math.abs(last[i] - earlier[i]) > 3) different += 1;
      }
      if (different > last.length / 40 / 200) break;
      held = end - back;
    }
    await draw(end);
    return {
      duration: video.duration,
      width: canvas.width,
      height: canvas.height,
      heldFrom: held,
      jpeg: canvas.toDataURL("image/jpeg", 0.9),
    };
  }, `${BASE}${record.media.video}`);

  const out = path.join(dir, path.basename(record.media.backdrop));
  await writeFile(out, Buffer.from(result.jpeg.split(",")[1], "base64"));
  console.log(
    `${record.id}@${record.version}: ${result.width}x${result.height}, ` +
      `${result.duration.toFixed(2)}s, last frame held from ${result.heldFrom.toFixed(2)}s`,
  );
  console.log(`  wrote ${out}`);
}

await browser.close();
