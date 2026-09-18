/**
 * What one QA view framed, without writing the picture.
 *
 * `qa-capture.mjs` answers "what does it look like"; this answers "what
 * was the camera pointed at", which is the question when a sheet frames
 * a hem instead of a head.
 *
 * Run from apps/web:  node scripts/qa-frame.mjs "<query string>"
 */
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
const query = process.argv[2] ?? "deity=vishnu&view=front";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 900, height: 1200 },
});
const page = await browser.newPage();
page.on("console", (message) => {
  if (message.type() === "error") console.log("ERR", message.text().slice(0, 300));
});
await page.goto(`${BASE}/dev/qa?${query}`, { waitUntil: "networkidle0", timeout: 120_000 });
await page.waitForFunction(() => window.__devaformQa, { timeout: 90_000 });
const image = await page.evaluate(() => window.__devaformQa);
console.log(
  JSON.stringify({
    frame: await page.evaluate(() => window.__devaformQaFrame ?? null),
    warnings: await page.evaluate(() => window.__devaformQaWarnings ?? []),
  }),
);
if (process.argv[3]) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(process.argv[3], Buffer.from(String(image).split(",")[1], "base64"));
}
await browser.close();
